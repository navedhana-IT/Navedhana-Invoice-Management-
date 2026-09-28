import { InjectQueue } from '@nestjs/bullmq';
import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PDF_QUEUE, type PdfJob } from '../../infra/queue.module';
import { PrismaService } from '../../infra/prisma.service';
import type { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ScheduleDto } from './dto';
import { InvoiceLedger } from './invoice-ledger';
import { InvoicesService } from './invoices.service';
import { claimNumber, seriesFor } from './numbering';
import type { Id } from '../../common/ids';

@Injectable()
export class InvoiceLifecycleService {
  private readonly logger = new Logger(InvoiceLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: InvoiceLedger,
    private readonly invoices: InvoicesService,
    @InjectQueue(PDF_QUEUE) private readonly pdfQueue: Queue<PdfJob>,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * DRAFT -> ISSUED/RECEIVED. Atomically allocates the number, freezes template version + branding,
   * ensures a payment schedule exists, then queues PDF generation.
   */
  async issue(t: TenantContext, id: Id) {
    const inv = await this.invoices.get(t, id, 'invoice.issue');
    await this.prisma.$transaction(async (tx) => {
      await this.ledger.lock(tx, id);
      const fresh = await tx.invoice.findUniqueOrThrow({ where: { id }, include: { schedule: true, customer: true, vendor: true } });
      if (fresh.status !== 'DRAFT') throw new ConflictException('Invoice is already issued');

      const service = await tx.service.findUniqueOrThrow({ where: { id: inv.serviceId }, include: { company: true } });
      const issueDate = fresh.issueDate ?? new Date();
      const invoiceNumber = await claimNumber(tx, service, seriesFor(inv.invoiceType), issueDate, service.company.timezone);
      const party = fresh.customer ?? fresh.vendor;

      const version = service.defaultTemplateId
        ? await tx.invoiceTemplateVersion.findFirst({ where: { templateId: service.defaultTemplateId, status: 'PUBLISHED' }, orderBy: { version: 'desc' } })
        : null;

      if (!fresh.schedule.length) {
        const dueDate = fresh.dueDate;
        await tx.paymentScheduleItem.create({
          data: { invoiceId: id, companyId: t.companyId, stageNumber: 1, description: 'Full payment', amount: fresh.total, dueType: dueDate ? 'FIXED' : 'NONE', dueDate },
        });
      }

      const { company } = service;
      await tx.invoice.update({
        where: { id },
        data: {
          invoiceNumber, status: inv.direction === 'PAYABLE' ? 'RECEIVED' : 'ISSUED', issueDate,
          issuedAt: new Date(), issuedById: t.userId, templateVersionId: version?.id,
          partySnapshot: party ? {
            name: party.name, email: party.email, phone: party.phone, gstin: party.gstin, pan: party.pan, state: party.state,
            address: 'billingAddress' in party ? party.billingAddress : party.address,
            shippingAddress: 'shippingAddress' in party ? party.shippingAddress : null,
          } : undefined,
          brandingSnapshot: {
            company: { legalName: company.legalName, gstin: company.gstin, pan: company.pan, address: company.address, city: company.city, state: company.state, pincode: company.pincode },
            service: {
              displayName: service.displayName, tagline: service.tagline, logoKey: service.logoKey, headerLogoKey: service.headerLogoKey, footerLogoKey: service.footerLogoKey,
              signatureKey: service.signatureKey, address: service.address, email: service.email, phone: service.phone, website: service.website,
              gstin: service.gstin, pan: service.pan, state: service.state, bankDetails: service.bankDetails, terms: service.terms,
            },
          },
        },
      });
      await this.ledger.recompute(tx, id);
      await this.audit.log({ actor: t.actor, companyId: t.companyId, serviceId: inv.serviceId, action: 'INVOICE_ISSUED', entityType: 'invoice', entityId: id, newValue: { invoiceNumber, templateVersionId: version?.id } }, tx);
    });
    await this.queuePdf(t, id);
    const issued = await this.invoices.get(t, id);
    const party = issued.customer?.name ?? issued.vendor?.name ?? '';
    await this.notifications.notifyPermission('invoice.view', {
      companyId: t.companyId, serviceId: issued.serviceId, type: 'INVOICE_ISSUED',
      title: `${issued.direction === 'PAYABLE' ? 'Bill recorded' : 'Invoice issued'} · ${issued.invoiceNumber}`,
      body: `${issued.total.toFixed(2)} ${issued.currency}${party ? ` · ${party}` : ''}`,
      link: `/app/invoices/${id}`,
    }, t.userId);
    return issued;
  }

  cancel(t: TenantContext, id: Id) {
    return this.close(t, id, 'CANCELLED');
  }

  void(t: TenantContext, id: Id) {
    return this.close(t, id, 'VOID');
  }

  private async close(t: TenantContext, id: Id, status: 'CANCELLED' | 'VOID') {
    const inv = await this.invoices.get(t, id, 'invoice.cancel');
    await this.prisma.$transaction(async (tx) => {
      await this.ledger.lock(tx, id);
      const fresh = await tx.invoice.findUniqueOrThrow({ where: { id } });
      if (fresh.status === 'DRAFT') throw new ConflictException('Delete drafts instead of cancelling');
      if (fresh.status === 'CANCELLED' || fresh.status === 'VOID') throw new ConflictException(`Invoice is already ${fresh.status.toLowerCase()}`);
      if (fresh.paidAmount.gt(0)) throw new ConflictException('Refund or reverse payments before cancelling');
      await tx.invoice.update({ where: { id }, data: { status, cancelledAt: new Date() } });
      await this.audit.log({ actor: t.actor, companyId: t.companyId, serviceId: inv.serviceId, action: status === 'VOID' ? 'INVOICE_VOIDED' : 'INVOICE_CANCELLED', entityType: 'invoice', entityId: id, previousValue: { status: fresh.status } }, tx);
    });
    return this.invoices.get(t, id);
  }

  /** Replace stages. Allowed while no successful payment has been allocated. */
  async setSchedule(t: TenantContext, id: Id, dto: ScheduleDto) {
    const inv = await this.invoices.get(t, id, 'invoice.update');
    if (inv.status === 'CANCELLED' || inv.status === 'VOID') throw new ConflictException('Invoice is closed');
    this.ledger.validateSchedule(dto.items, inv.total);
    await this.prisma.$transaction(async (tx) => {
      await this.ledger.lock(tx, id);
      const paid = await tx.paymentAllocation.count({ where: { scheduleItem: { invoiceId: id }, payment: { status: 'SUCCESS' } } });
      if (paid) throw new ConflictException('Schedule cannot change after payments are recorded');
      await tx.paymentScheduleItem.deleteMany({ where: { invoiceId: id } });
      await tx.paymentScheduleItem.createMany({ data: this.ledger.scheduleRows(t.companyId, dto.items).map((r) => ({ ...r, invoiceId: id })) });
      if (inv.status !== 'DRAFT') await this.ledger.recompute(tx, id);
      await this.audit.log({ actor: t.actor, companyId: t.companyId, serviceId: inv.serviceId, action: 'SCHEDULE_UPDATED', entityType: 'invoice', entityId: id, newValue: dto }, tx);
    });
    return this.invoices.get(t, id);
  }

  async queuePdf(t: TenantContext, invoiceId: Id) {
    try {
      const job = this.pdfQueue.add('render', { invoiceId, companyId: t.companyId, actorUserId: t.userId }, { jobId: `pdf-${invoiceId}-${Date.now()}` });
      await Promise.race([job, new Promise((_, reject) => setTimeout(() => reject(new Error('queue timeout')), 3000))]);
    } catch (e) {
      this.logger.warn(`PDF job not queued for ${invoiceId}: ${(e as Error).message}. It will render on first download.`);
    }
  }
}
