import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceDirection, InvoiceStatus, InvoiceType, Prisma, TaxMode } from '@prisma/client';
import { todayIn } from '../../common/dates';
import { D } from '../../common/money';
import { dateRange, orderBy, pageArgs, toPage } from '../../common/pagination';
import { assertLimit } from '../../common/plan-limits';
import type { Permission } from '../../common/permissions';
import { PrismaService } from '../../infra/prisma.service';
import type { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from '../audit/audit.service';
import { validateCustomFieldValues } from '../invoice-templates/custom-field-values';
import { CreateInvoiceDto, InvoiceQuery, UpdateInvoiceDto } from './dto';
import { calculateInvoice } from './invoice-calculator';
import { InvoiceLedger } from './invoice-ledger';
import type { Id } from '../../common/ids';

export const invoiceDetail = {
  items: { orderBy: { position: 'asc' } },
  schedule: { orderBy: { stageNumber: 'asc' } },
  payments: { orderBy: { paidAt: 'desc' }, include: { allocations: true } },
  customer: true,
  vendor: true,
  service: { select: { id: true, name: true, displayName: true, state: true } },
  referenceInvoice: { select: { id: true, invoiceNumber: true } },
} satisfies Prisma.InvoiceInclude;

const directionOf = (type: InvoiceType): InvoiceDirection => (type === 'PURCHASE' ? 'PAYABLE' : 'RECEIVABLE');

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: InvoiceLedger,
  ) {}

  async list(t: TenantContext, q: InvoiceQuery) {
    if (q.serviceId) t.assertService('invoice.view', q.serviceId);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: t.companyId }, select: { timezone: true } });
    const today = todayIn(company.timezone);
    const open = { status: { notIn: ['DRAFT', 'CANCELLED', 'VOID'] as InvoiceStatus[] }, balanceAmount: { gt: 0 } };
    const where: Prisma.InvoiceWhereInput = {
      companyId: t.companyId,
      serviceId: q.serviceId ?? { in: t.serviceScope('invoice.view') },
      ...(q.status && { status: q.status }),
      ...(q.invoiceType && { invoiceType: q.invoiceType }),
      ...(q.direction && { direction: q.direction }),
      ...(q.customerId && { customerId: q.customerId }),
      ...(q.vendorId && { vendorId: q.vendorId }),
      AND: [
        dateRange(q.from, q.to) ? { issueDate: dateRange(q.from, q.to) } : {},
        dateRange(q.dueFrom, q.dueTo) ? { dueDate: dateRange(q.dueFrom, q.dueTo) } : {},
        q.minAmount || q.maxAmount ? { total: { ...(q.minAmount && { gte: q.minAmount }), ...(q.maxAmount && { lte: q.maxAmount }) } } : {},
        q.payment === 'OPEN' ? open : {},
        q.payment === 'SETTLED' ? { status: 'PAID' as const } : {},
        q.payment === 'OVERDUE' ? { ...open, invoiceType: { not: 'PROFORMA' as const }, OR: [{ status: 'OVERDUE' as const }, { dueDate: { lt: today } }] } : {},
        q.search ? {
          OR: [
            { invoiceNumber: { contains: q.search, mode: 'insensitive' as const } },
            { externalNumber: { contains: q.search, mode: 'insensitive' as const } },
            { customer: { name: { contains: q.search, mode: 'insensitive' as const } } },
            { vendor: { name: { contains: q.search, mode: 'insensitive' as const } } },
          ],
        } : {},
      ],
    };
    const [field, dir] = (q.sort ?? '').split(':');
    const sort: Prisma.InvoiceOrderByWithRelationInput = field === 'party'
      ? (q.direction === 'PAYABLE' ? { vendor: { name: dir === 'asc' ? 'asc' : 'desc' } } : { customer: { name: dir === 'asc' ? 'asc' : 'desc' } })
      : orderBy(q, ['createdAt', 'issueDate', 'dueDate', 'total', 'balanceAmount', 'invoiceNumber', 'status']);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where, ...pageArgs(q), orderBy: [sort, { createdAt: 'desc' }],
        include: { customer: { select: { name: true } }, vendor: { select: { name: true } }, service: { select: { name: true } } },
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return toPage(data, total, q);
  }

  /** Tenant + service scoped lookup; other tenants' invoices are indistinguishable from missing ones. */
  async get(t: TenantContext, id: Id, perm: Permission = 'invoice.view') {
    const inv = await this.prisma.invoice.findFirst({
      where: { id, companyId: t.companyId, serviceId: { in: t.allowedServiceIds } },
      include: invoiceDetail,
    });
    if (!inv) throw new NotFoundException('Invoice not found');
    t.assertService(perm, inv.serviceId);
    return inv;
  }

  /** `convertedFrom` links a tax invoice to the proforma it was created from; callers can't set it through the DTO. */
  async create(t: TenantContext, dto: CreateInvoiceDto, convertedFrom?: Id) {
    t.assertService('invoice.create', dto.serviceId);
    const service = await this.prisma.service.findFirstOrThrow({ where: { id: dto.serviceId, companyId: t.companyId } });
    const party = await this.resolveParty(t, dto);
    const taxMode = dto.taxMode ?? autoTaxMode(service.state, party.state);
    const calc = calculateInvoice(dto.items, taxMode);
    if (dto.schedule) this.ledger.validateSchedule(dto.schedule, calc.total);
    if (party.creditLimit && calc.total.gt(party.creditLimit)) {
      throw new BadRequestException(`A credit note can't exceed the referenced invoice's remaining creditable amount (${party.creditLimit.toFixed(2)})`);
    }
    await this.checkProducts(t, dto.serviceId, dto.items);
    await this.checkCustomFields(dto.serviceId, dto.customFieldValues);

    const inv = await this.prisma.$transaction(async (tx) => {
      await assertLimit(tx, t.companyId, 'maxInvoicesPerMonth');
      const created = await tx.invoice.create({
        data: {
          companyId: t.companyId, serviceId: dto.serviceId, invoiceType: dto.invoiceType, direction: party.direction,
          customerId: party.customerId, vendorId: party.vendorId, referenceInvoiceId: party.referenceInvoiceId ?? convertedFrom,
          externalNumber: dto.externalNumber, issueDate: dto.issueDate, dueDate: dto.dueDate, currency: dto.currency ?? 'INR',
          taxMode, notes: dto.notes, terms: dto.terms ?? service.terms, customFieldValues: (dto.customFieldValues ?? {}) as Prisma.InputJsonObject,
          subtotal: calc.subtotal, discountTotal: calc.discountTotal, taxTotal: calc.taxTotal, total: calc.total,
          balanceAmount: calc.total, createdById: t.userId,
          items: { create: dto.items.map((it, i) => ({ ...itemRow(it, calc.lines[i], i), companyId: t.companyId })) },
          schedule: dto.schedule?.length ? { create: this.ledger.scheduleRows(t.companyId, dto.schedule) } : undefined,
        },
      });
      await this.audit.log({ actor: t.actor, companyId: t.companyId, serviceId: dto.serviceId, action: 'INVOICE_CREATED', entityType: 'invoice', entityId: created.id, newValue: { ...dto, total: calc.total } }, tx);
      return created;
    });
    return this.get(t, inv.id);
  }

  /** Only drafts are editable. Totals are always recomputed server-side. */
  async update(t: TenantContext, id: Id, dto: UpdateInvoiceDto) {
    const inv = await this.get(t, id, 'invoice.update');
    if (inv.status !== 'DRAFT') throw new ConflictException('Only draft invoices can be edited');
    const taxMode = dto.taxMode ?? inv.taxMode;
    const items = dto.items ?? inv.items.map((i) => ({ ...i, quantity: i.quantity.toString(), unitPrice: i.unitPrice.toString(), discount: i.discount.toString(), taxRate: i.taxRate.toString(), hsnSac: i.hsnSac ?? undefined, productId: i.productId ?? undefined }));
    const calc = calculateInvoice(items, taxMode);
    const schedule = dto.schedule ?? inv.schedule.map((s) => ({ ...s, amount: s.amount.toString(), description: s.description ?? undefined, dueDate: s.dueDate ?? undefined }));
    this.ledger.validateSchedule(schedule, calc.total);
    if (dto.items) await this.checkProducts(t, inv.serviceId, dto.items);
    if (dto.customFieldValues) await this.checkCustomFields(inv.serviceId, dto.customFieldValues);
    // Only the party matching the invoice direction may change; notes keep their reference invoice's party.
    const isNote = inv.invoiceType === 'CREDIT_NOTE' || inv.invoiceType === 'DEBIT_NOTE';
    const partyField = inv.direction === 'PAYABLE' ? { vendorId: dto.vendorId } : { customerId: dto.customerId };
    if (!isNote && (partyField.customerId || partyField.vendorId)) {
      await this.resolveParty(t, { ...partyField, invoiceType: inv.invoiceType, serviceId: inv.serviceId, items });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      await tx.paymentScheduleItem.deleteMany({ where: { invoiceId: id } });
      await tx.invoice.update({
        where: { id },
        data: {
          ...(isNote ? {} : partyField), externalNumber: dto.externalNumber, issueDate: dto.issueDate,
          dueDate: dto.dueDate, currency: dto.currency, taxMode, notes: dto.notes, terms: dto.terms,
          customFieldValues: dto.customFieldValues as Prisma.InputJsonObject | undefined,
          subtotal: calc.subtotal, discountTotal: calc.discountTotal, taxTotal: calc.taxTotal, total: calc.total, balanceAmount: calc.total,
          items: { create: items.map((it, i) => ({ ...itemRow(it, calc.lines[i], i), companyId: t.companyId })) },
          schedule: schedule.length ? { create: this.ledger.scheduleRows(t.companyId, schedule) } : undefined,
        },
      });
      await this.audit.log({ actor: t.actor, companyId: t.companyId, serviceId: inv.serviceId, action: 'INVOICE_UPDATED', entityType: 'invoice', entityId: id, previousValue: { total: inv.total }, newValue: dto }, tx);
    });
    return this.get(t, id);
  }

  /** Creates a draft tax invoice (or sales invoice for brands without a GSTIN) copying an issued proforma. */
  async convertProforma(t: TenantContext, id: Id) {
    const pf = await this.get(t, id);
    if (pf.invoiceType !== 'PROFORMA') throw new BadRequestException('Only proforma invoices can be converted');
    if (['DRAFT', 'CANCELLED', 'VOID'].includes(pf.status)) throw new ConflictException('Issue the proforma before converting it');
    const existing = await this.prisma.invoice.findFirst({
      where: { companyId: t.companyId, referenceInvoiceId: id, invoiceType: { in: ['TAX', 'SALES'] }, status: { notIn: ['CANCELLED', 'VOID'] } },
      select: { id: true, invoiceNumber: true },
    });
    if (existing) throw new ConflictException(`This proforma was already converted (${existing.invoiceNumber ?? 'draft'}). Cancel or void that invoice to convert again`);
    const service = await this.prisma.service.findFirstOrThrow({ where: { id: pf.serviceId, companyId: t.companyId }, select: { gstin: true } });
    return this.create(t, {
      serviceId: pf.serviceId, invoiceType: service.gstin ? 'TAX' : 'SALES', customerId: pf.customerId ?? undefined,
      dueDate: pf.dueDate ?? undefined, currency: pf.currency, taxMode: pf.taxMode, notes: pf.notes ?? undefined, terms: pf.terms ?? undefined,
      customFieldValues: (pf.customFieldValues ?? {}) as Record<string, unknown>,
      items: pf.items.map((i) => ({
        productId: i.productId ?? undefined, description: i.description, hsnSac: i.hsnSac ?? undefined,
        quantity: i.quantity.toFixed(4), unitPrice: i.unitPrice.toFixed(2), discount: i.discount.toFixed(2), taxRate: i.taxRate.toFixed(2),
      })),
      schedule: pf.schedule.length ? pf.schedule.map((s) => ({ description: s.description ?? undefined, amount: s.amount.toFixed(2), dueType: s.dueType, dueDate: s.dueDate ?? undefined })) : undefined,
    }, id);
  }

  async remove(t: TenantContext, id: Id) {
    const inv = await this.get(t, id, 'invoice.delete');
    if (inv.status !== 'DRAFT') throw new ConflictException('Issued invoices cannot be deleted; cancel or void them');
    await this.prisma.invoice.delete({ where: { id } });
    await this.audit.log({ actor: t.actor, companyId: t.companyId, serviceId: inv.serviceId, action: 'INVOICE_DELETED', entityType: 'invoice', entityId: id });
  }

  private async resolveParty(t: TenantContext, dto: CreateInvoiceDto) {
    if (dto.invoiceType === 'CREDIT_NOTE' || dto.invoiceType === 'DEBIT_NOTE') {
      if (!dto.referenceInvoiceId) throw new BadRequestException('Credit/debit notes need referenceInvoiceId');
      const ref = await this.prisma.invoice.findFirst({
        where: { id: dto.referenceInvoiceId, companyId: t.companyId, serviceId: dto.serviceId, status: { notIn: ['DRAFT', 'VOID', 'CANCELLED'] }, invoiceType: { notIn: ['CREDIT_NOTE', 'DEBIT_NOTE', 'PROFORMA'] } },
        include: { customer: true, vendor: true, adjustments: { where: { invoiceType: 'CREDIT_NOTE', status: { notIn: ['VOID', 'CANCELLED'] } }, select: { total: true } } },
      });
      if (!ref) throw new BadRequestException('The reference invoice must be an issued invoice of the same service');
      const credited = ref.adjustments.reduce((s, a) => s.plus(a.total), D(0));
      return {
        direction: ref.direction, customerId: ref.customerId, vendorId: ref.vendorId, state: (ref.customer ?? ref.vendor)?.state, referenceInvoiceId: ref.id,
        creditLimit: dto.invoiceType === 'CREDIT_NOTE' ? D(ref.total).minus(credited) : undefined,
      };
    }
    const direction = directionOf(dto.invoiceType);
    if (direction === 'RECEIVABLE') {
      const c = dto.customerId && (await this.prisma.customer.findFirst({ where: { id: dto.customerId, companyId: t.companyId } }));
      if (!c) throw new BadRequestException('Select a customer for this invoice');
      return { direction, customerId: c.id, vendorId: null, state: c.state, creditLimit: undefined, referenceInvoiceId: undefined };
    }
    const v = dto.vendorId && (await this.prisma.vendor.findFirst({ where: { id: dto.vendorId, companyId: t.companyId } }));
    if (!v) throw new BadRequestException('Select a vendor for this bill');
    return { direction, customerId: null, vendorId: v.id, state: v.state, creditLimit: undefined, referenceInvoiceId: undefined };
  }

  /** Products must be company-wide or belong to the invoice's service. */
  private async checkProducts(t: TenantContext, serviceId: Id, items: { productId?: Id }[]) {
    const ids = [...new Set(items.flatMap((i) => (i.productId ? [i.productId] : [])))];
    const where = { id: { in: ids }, companyId: t.companyId, OR: [{ serviceId: null }, { serviceId }] };
    if (ids.length && (await this.prisma.product.count({ where })) !== ids.length) {
      throw new BadRequestException('One or more products are not available for this service');
    }
  }

  private async checkCustomFields(serviceId: Id, values?: Record<string, unknown>) {
    const defs = await this.prisma.customFieldDefinition.findMany({ where: { serviceId } });
    validateCustomFieldValues(defs, values ?? {});
  }
}

function autoTaxMode(serviceState?: string | null, partyState?: string | null): TaxMode {
  if (!serviceState || !partyState) return 'INTRA_STATE';
  return serviceState.trim().toLowerCase() === partyState.trim().toLowerCase() ? 'INTRA_STATE' : 'INTER_STATE';
}

function itemRow(it: CreateInvoiceDto['items'][number], line: ReturnType<typeof calculateInvoice>['lines'][number], position: number) {
  return { productId: it.productId, description: it.description, hsnSac: it.hsnSac, position, ...line };
}
