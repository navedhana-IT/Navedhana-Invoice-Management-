import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get, Header, HttpCode, Module, Param, Patch, Post, Put, Query, Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RequirePermission, Tenant } from '../../common/decorators';
import { Mailer } from '../../infra/mail.service';
import { PrismaService } from '../../infra/prisma.service';
import { StorageService } from '../../infra/storage.service';
import type { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from '../audit/audit.service';
import { PdfModule } from '../pdf/pdf.module';
import { PdfService } from '../pdf/pdf.service';
import { CreateInvoiceDto, InvoiceQuery, ScheduleDto, SendInvoiceDto, UpdateInvoiceDto } from './dto';
import { InvoiceLedger } from './invoice-ledger';
import { InvoiceLifecycleService } from './invoice-lifecycle.service';
import { InvoicesService } from './invoices.service';
import { ParseIdPipe, type Id } from '../../common/ids';

const id = () => Param('id', ParseIdPipe);
const DOC_LABEL: Record<string, string> = { TAX: 'Tax invoice', SALES: 'Invoice', PROFORMA: 'Proforma invoice', CREDIT_NOTE: 'Credit note', DEBIT_NOTE: 'Debit note' };

@ApiTags('invoices')
@ApiBearerAuth()
@Controller('invoices')
class InvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly lifecycle: InvoiceLifecycleService,
    private readonly pdf: PdfService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly mailer: Mailer,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @RequirePermission('invoice.view')
  list(@Tenant() t: TenantContext, @Query() q: InvoiceQuery) {
    return this.invoices.list(t, q);
  }

  @Post()
  @RequirePermission('invoice.create')
  create(@Tenant() t: TenantContext, @Body() dto: CreateInvoiceDto) {
    return this.invoices.create(t, dto);
  }

  @Get(':id')
  @RequirePermission('invoice.view')
  get(@Tenant() t: TenantContext, @id() invoiceId: Id) {
    return this.invoices.get(t, invoiceId);
  }

  @Post(':id/convert')
  @RequirePermission('invoice.create')
  convert(@Tenant() t: TenantContext, @id() invoiceId: Id) {
    return this.invoices.convertProforma(t, invoiceId);
  }

  @Patch(':id')
  @RequirePermission('invoice.update')
  update(@Tenant() t: TenantContext, @id() invoiceId: Id, @Body() dto: UpdateInvoiceDto) {
    return this.invoices.update(t, invoiceId, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('invoice.delete')
  remove(@Tenant() t: TenantContext, @id() invoiceId: Id) {
    return this.invoices.remove(t, invoiceId);
  }

  @Post(':id/issue')
  @HttpCode(200)
  @RequirePermission('invoice.issue')
  issue(@Tenant() t: TenantContext, @id() invoiceId: Id) {
    return this.lifecycle.issue(t, invoiceId);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('invoice.cancel')
  cancel(@Tenant() t: TenantContext, @id() invoiceId: Id) {
    return this.lifecycle.cancel(t, invoiceId);
  }

  @Post(':id/void')
  @HttpCode(200)
  @RequirePermission('invoice.cancel')
  void(@Tenant() t: TenantContext, @id() invoiceId: Id) {
    return this.lifecycle.void(t, invoiceId);
  }

  /** Emails the issued invoice PDF to the customer (queued; delivered by the worker). */
  @Post(':id/send')
  @HttpCode(202)
  @RequirePermission('invoice.send')
  async send(@Tenant() t: TenantContext, @id() invoiceId: Id, @Body() dto: SendInvoiceDto) {
    const inv = await this.invoices.get(t, invoiceId, 'invoice.send');
    if (inv.direction !== 'RECEIVABLE') throw new BadRequestException('Only sales documents can be emailed to customers');
    if (['DRAFT', 'CANCELLED', 'VOID'].includes(inv.status)) throw new ConflictException('Issue the invoice before sending it');
    const to = dto.to?.length ? dto.to : inv.customer?.email ? [inv.customer.email] : [];
    if (!to.length) throw new BadRequestException('This customer has no email address. Add one or enter a recipient.');

    // A fresh stored copy per email, so the attachment has the latest details and there's a record of what was sent.
    const doc = await this.pdf.generate(invoiceId, t.companyId, t.userId, true);
    const service = await this.prisma.service.findUniqueOrThrow({ where: { id: inv.serviceId }, select: { name: true, displayName: true, email: true } });
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: t.companyId }, select: { timezone: true } });
    const due = inv.schedule.find((s) => s.dueDate && s.status !== 'PAID')?.dueDate ?? inv.dueDate;
    await this.mailer.send({
      template: 'invoice',
      to: to.join(', '),
      cc: dto.cc?.length ? dto.cc.join(', ') : undefined,
      replyTo: service.email ?? undefined,
      attachments: [{ storageKey: doc.storageKey, filename: `${inv.invoiceNumber}.pdf` }],
      data: {
        brand: service.displayName ?? service.name,
        documentLabel: DOC_LABEL[inv.invoiceType] ?? 'Invoice',
        number: inv.invoiceNumber!,
        customer: inv.customer?.name ?? 'Customer',
        amount: new Intl.NumberFormat('en-IN', { style: 'currency', currency: inv.currency }).format(Number(inv.balanceAmount.gt(0) ? inv.balanceAmount : inv.total)),
        dueDate: due ? due.toLocaleDateString('en-IN', { timeZone: company.timezone, dateStyle: 'medium' }) : undefined,
        message: dto.message?.trim() || undefined,
      },
    });
    await this.audit.log({ actor: t.actor, companyId: t.companyId, serviceId: inv.serviceId, action: 'INVOICE_SENT', entityType: 'invoice', entityId: invoiceId, newValue: { to, cc: dto.cc } });
    return { queued: true, to };
  }

  @Get(':id/payment-schedule')
  @RequirePermission('invoice.view')
  async schedule(@Tenant() t: TenantContext, @id() invoiceId: Id) {
    return (await this.invoices.get(t, invoiceId)).schedule;
  }

  @Put(':id/payment-schedule')
  @RequirePermission('invoice.update')
  setSchedule(@Tenant() t: TenantContext, @id() invoiceId: Id, @Body() dto: ScheduleDto) {
    return this.lifecycle.setSchedule(t, invoiceId, dto);
  }

  /** HTML preview (drafts use live branding; issued invoices use the frozen snapshot). */
  @Get(':id/preview')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Content-Security-Policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'")
  @RequirePermission('invoice.view')
  async preview(@Tenant() t: TenantContext, @id() invoiceId: Id) {
    await this.invoices.get(t, invoiceId);
    return this.pdf.html(invoiceId, t.companyId);
  }

  /** Streams the PDF through the API so storage credentials/URLs are never exposed. */
  @Get(':id/pdf')
  @RequirePermission('invoice.view')
  async download(@Tenant() t: TenantContext, @id() invoiceId: Id, @Res() res: Response) {
    const inv = await this.invoices.get(t, invoiceId);
    const body = await this.pdf.toPdf(await this.pdf.html(invoiceId, t.companyId));
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${inv.invoiceNumber ?? 'draft'}.pdf"` }).send(body);
  }

  @Post(':id/regenerate-pdf')
  @HttpCode(200)
  @RequirePermission('invoice.issue')
  async regenerate(@Tenant() t: TenantContext, @id() invoiceId: Id) {
    const inv = await this.invoices.get(t, invoiceId, 'invoice.issue');
    const doc = await this.pdf.generate(invoiceId, t.companyId, t.userId, true);
    await this.audit.log({ actor: t.actor, companyId: t.companyId, serviceId: inv.serviceId, action: 'PDF_REGENERATED', entityType: 'invoice', entityId: invoiceId, previousValue: { pdfDocumentId: inv.pdfDocumentId }, newValue: { pdfDocumentId: doc.id } });
    return doc;
  }
}

@Module({
  imports: [PdfModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoiceLifecycleService, InvoiceLedger],
  exports: [InvoicesService, InvoiceLedger],
})
export class InvoicesModule {}
