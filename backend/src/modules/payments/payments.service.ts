import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceDirection, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { D, Decimal } from '../../common/money';
import { dateRange, orderBy, pageArgs, PageQuery, toPage } from '../../common/pagination';
import { PrismaService } from '../../infra/prisma.service';
import { Realtime } from '../../infra/realtime';
import type { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from '../audit/audit.service';
import { InvoiceLedger } from '../invoices/invoice-ledger';
import { InvoicesService } from '../invoices/invoices.service';
import { claimNumber } from '../invoices/numbering';
import { NotificationsService } from '../notifications/notifications.service';
import { IsId, type Id } from '../../common/ids';

const MONEY = /^\d{1,16}(\.\d{1,2})?$/;

export class CreatePaymentDto {
  @Matches(MONEY, { message: 'Amount must be a number with up to 2 decimals' }) amount: string;
  @IsEnum(PaymentMethod) method: PaymentMethod;
  /** Actual time the money moved. */
  @Type(() => Date) @IsDate() paidAt: Date;
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  /** Apply to a specific stage first; remainder goes to the oldest-due stages. */
  @IsOptional() @IsId() scheduleItemId?: Id;
  /** Record a failed attempt for traceability (no allocation). */
  @IsOptional() @IsIn(['SUCCESS', 'FAILED']) status?: 'SUCCESS' | 'FAILED';
}

export class ReversePaymentDto {
  @IsString() @MinLength(3, { message: 'Give a short reason' }) @MaxLength(500) reason: string;
}

export class PaymentQuery extends PageQuery {
  @IsOptional() @IsEnum(InvoiceDirection) direction?: InvoiceDirection;
  @IsOptional() @IsId() serviceId?: Id;
  @IsOptional() @IsId() customerId?: Id;
  @IsOptional() @IsId() vendorId?: Id;
  @IsOptional() @IsEnum(PaymentMethod) method?: PaymentMethod;
  @IsOptional() @IsEnum(PaymentStatus) status?: PaymentStatus;
  @IsOptional() @Type(() => Date) @IsDate() from?: Date;
  @IsOptional() @Type(() => Date) @IsDate() to?: Date;
  @IsOptional() @Matches(MONEY) minAmount?: string;
  @IsOptional() @Matches(MONEY) maxAmount?: string;
}

const PAYABLE_STATES = ['ISSUED', 'RECEIVED', 'PARTIALLY_PAID', 'OVERDUE'];

const listInclude = {
  invoice: { select: { id: true, invoiceNumber: true, externalNumber: true, direction: true, invoiceType: true, currency: true, customer: { select: { id: true, name: true } }, vendor: { select: { id: true, name: true } } } },
} satisfies Prisma.PaymentInclude;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: InvoiceLedger,
    private readonly invoices: InvoicesService,
    private readonly notifications: NotificationsService,
    private readonly realtime: Realtime,
  ) {}

  async listForInvoice(t: TenantContext, invoiceId: Id) {
    await this.invoices.get(t, invoiceId, 'payment.view');
    return this.prisma.payment.findMany({ where: { invoiceId, companyId: t.companyId }, include: { allocations: true }, orderBy: { paidAt: 'desc' } });
  }

  /** Company-wide payments (receipts and vouchers) across the services the user may view payments for. */
  async list(t: TenantContext, q: PaymentQuery) {
    if (q.serviceId) t.assertService('payment.view', q.serviceId);
    const where: Prisma.PaymentWhereInput = {
      companyId: t.companyId,
      serviceId: q.serviceId ?? { in: t.serviceScope('payment.view') },
      ...(q.method && { method: q.method }),
      ...(q.status && { status: q.status }),
      ...(dateRange(q.from, q.to) && { paidAt: dateRange(q.from, q.to) }),
      ...((q.minAmount || q.maxAmount) && { amount: { ...(q.minAmount && { gte: q.minAmount }), ...(q.maxAmount && { lte: q.maxAmount }) } }),
      invoice: {
        ...(q.direction && { direction: q.direction }),
        ...(q.customerId && { customerId: q.customerId }),
        ...(q.vendorId && { vendorId: q.vendorId }),
      },
      ...(q.search && {
        OR: [
          { reference: { contains: q.search, mode: 'insensitive' } },
          { receiptNumber: { contains: q.search, mode: 'insensitive' } },
          { invoice: { invoiceNumber: { contains: q.search, mode: 'insensitive' } } },
          { invoice: { customer: { name: { contains: q.search, mode: 'insensitive' } } } },
          { invoice: { vendor: { name: { contains: q.search, mode: 'insensitive' } } } },
        ],
      }),
    };
    const [data, total, sums] = await this.prisma.$transaction([
      this.prisma.payment.findMany({ where, include: listInclude, ...pageArgs(q), orderBy: [orderBy(q, ['paidAt', 'amount', 'createdAt'], 'paidAt'), { createdAt: 'desc' }] }),
      this.prisma.payment.count({ where }),
      this.prisma.payment.aggregate({ where: { ...where, status: 'SUCCESS' }, _sum: { amount: true } }),
    ]);
    return { ...toPage(data, total, q), summary: { successTotal: (sums._sum.amount ?? D(0)).toFixed(2) } };
  }

  async get(t: TenantContext, id: Id) {
    const p = await this.prisma.payment.findFirst({ where: { id, companyId: t.companyId, serviceId: { in: t.allowedServiceIds } }, include: { ...listInclude, allocations: true } });
    if (!p) throw new NotFoundException('Payment not found');
    t.assertService('payment.view', p.serviceId);
    return p;
  }

  async create(t: TenantContext, invoiceId: Id, dto: CreatePaymentDto) {
    const inv = await this.invoices.get(t, invoiceId, 'payment.create');
    const amount = D(dto.amount).toDecimalPlaces(2);
    if (amount.lte(0)) throw new BadRequestException('Amount must be greater than 0');
    if (dto.paidAt > new Date(Date.now() + 5 * 60_000)) throw new BadRequestException('Payment date cannot be in the future');

    const result = await this.prisma.$transaction(async (tx) => {
      await this.ledger.lock(tx, invoiceId);
      const fresh = await tx.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
        include: { schedule: { orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { stageNumber: 'asc' }] }, service: { select: { id: true, code: true, numbering: true, company: { select: { timezone: true } } } } },
      });
      if (fresh.invoiceType === 'PROFORMA') throw new ConflictException('Proforma invoices cannot receive payments; issue a tax invoice');
      if (fresh.invoiceType === 'CREDIT_NOTE' || fresh.invoiceType === 'DEBIT_NOTE') throw new ConflictException('Record payments against the original invoice, not the credit or debit note');
      if (!PAYABLE_STATES.includes(fresh.status)) throw new ConflictException(`Payments can't be recorded on a ${fresh.status.toLowerCase().replace('_', ' ')} invoice`);

      const failed = dto.status === 'FAILED';
      if (!failed && amount.gt(fresh.balanceAmount)) {
        throw new BadRequestException(`Amount is more than the outstanding balance of ${fresh.balanceAmount.toFixed(2)}`);
      }
      if (dto.scheduleItemId && !fresh.schedule.some((s) => s.id === dto.scheduleItemId)) throw new BadRequestException('That payment stage does not belong to this invoice');
      const receiptNumber = failed ? null : await claimNumber(tx, fresh.service, fresh.direction === 'PAYABLE' ? 'VOUCHER' : 'RECEIPT', dto.paidAt, fresh.service.company.timezone);
      const payment = await tx.payment.create({
        data: {
          companyId: t.companyId, serviceId: inv.serviceId, invoiceId, amount, method: dto.method, reference: dto.reference, receiptNumber,
          paidAt: dto.paidAt, notes: dto.notes, status: failed ? 'FAILED' : 'SUCCESS', createdById: t.userId,
        },
      });

      let updated = fresh;
      if (!failed) {
        const stages = [...fresh.schedule];
        if (dto.scheduleItemId) {
          const i = stages.findIndex((s) => s.id === dto.scheduleItemId);
          stages.unshift(...stages.splice(i, 1));
        }
        let left: Decimal = amount;
        for (const s of stages) {
          if (left.lte(0)) break;
          const open = D(s.amount).minus(s.paidAmount);
          if (open.lte(0)) continue;
          const take = Decimal.min(open, left);
          await tx.paymentAllocation.create({ data: { companyId: t.companyId, paymentId: payment.id, scheduleItemId: s.id, amount: take } });
          await tx.paymentScheduleItem.update({ where: { id: s.id }, data: { paidAmount: { increment: take } } });
          left = left.minus(take);
        }
        updated = { ...fresh, ...(await this.ledger.recompute(tx, invoiceId)) };
      }
      await this.audit.log({ actor: t.actor, companyId: t.companyId, serviceId: inv.serviceId, action: 'PAYMENT_CREATED', entityType: 'payment', entityId: payment.id, newValue: { invoiceId, receiptNumber, ...dto } }, tx);
      return { payment: await tx.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { allocations: true } }), invoice: updated, failed };
    });

    await this.broadcast(t, result.invoice);
    if (!result.failed) {
      const payable = result.invoice.direction === 'PAYABLE';
      const party = inv.customer?.name ?? inv.vendor?.name ?? '';
      await this.notifications.notifyPermission('payment.view', {
        companyId: t.companyId, serviceId: inv.serviceId, type: payable ? 'PAYMENT_MADE' : 'PAYMENT_RECEIVED',
        title: payable ? `Payment made · ${result.payment.receiptNumber}` : `Payment received · ${result.payment.receiptNumber}`,
        body: `${amount.toFixed(2)} ${inv.currency} ${payable ? 'paid to' : 'from'} ${party} for ${inv.invoiceNumber}`,
        link: `/app/invoices/${invoiceId}`,
      }, t.userId);
    }
    return result.payment;
  }

  refund(t: TenantContext, paymentId: Id, dto: ReversePaymentDto) {
    return this.undo(t, paymentId, dto, 'REFUNDED');
  }

  reverse(t: TenantContext, paymentId: Id, dto: ReversePaymentDto) {
    return this.undo(t, paymentId, dto, 'REVERSED');
  }

  /** Refund (money returned) or reversal (entry error). Allocation rows are kept for history. */
  private async undo(t: TenantContext, paymentId: Id, dto: ReversePaymentDto, status: 'REFUNDED' | 'REVERSED') {
    const p = await this.prisma.payment.findFirst({ where: { id: paymentId, companyId: t.companyId } });
    if (!p) throw new NotFoundException('Payment not found');
    await this.invoices.get(t, p.invoiceId, 'payment.refund');

    const { payment, invoice } = await this.prisma.$transaction(async (tx) => {
      await this.ledger.lock(tx, p.invoiceId);
      const fresh = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { allocations: true } });
      if (fresh.status !== 'SUCCESS') throw new ConflictException(`This payment is already ${fresh.status.toLowerCase()}`);
      for (const a of fresh.allocations) {
        await tx.paymentScheduleItem.update({ where: { id: a.scheduleItemId }, data: { paidAmount: { decrement: a.amount } } });
      }
      await tx.payment.update({ where: { id: paymentId }, data: { status, notes: [fresh.notes, `${status}: ${dto.reason}`].filter(Boolean).join('\n') } });
      const invoice = await this.ledger.recompute(tx, p.invoiceId);
      await this.audit.log({ actor: t.actor, companyId: t.companyId, serviceId: p.serviceId, action: status === 'REFUNDED' ? 'PAYMENT_REFUNDED' : 'PAYMENT_REVERSED', entityType: 'payment', entityId: paymentId, previousValue: { status: 'SUCCESS' }, newValue: { status, reason: dto.reason } }, tx);
      return { payment: await tx.payment.findUniqueOrThrow({ where: { id: paymentId } }), invoice };
    });
    await this.broadcast(t, invoice);
    return payment;
  }

  /** Live status/balance for everyone looking at this invoice. */
  private async broadcast(t: TenantContext, inv: { id: Id; serviceId: Id; status: string; paidAmount: Prisma.Decimal; balanceAmount: Prisma.Decimal }) {
    const users = await this.notifications.recipients(t.companyId, inv.serviceId, 'invoice.view');
    this.realtime.toUsers(users, 'invoice.updated', {
      companyId: t.companyId, invoiceId: inv.id, status: inv.status, paidAmount: inv.paidAmount.toFixed(2), balanceAmount: inv.balanceAmount.toFixed(2),
    });
  }
}
