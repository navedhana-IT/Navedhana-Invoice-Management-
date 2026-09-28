import { Body, Controller, Get, HttpCode, Module, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RequirePermission, Tenant } from '../../common/decorators';
import { StorageService } from '../../infra/storage.service';
import type { TenantContext } from '../../tenancy/tenant-context';
import { InvoicesModule } from '../invoices/invoices.module';
import { PdfModule } from '../pdf/pdf.module';
import { PdfService } from '../pdf/pdf.service';
import { CreatePaymentDto, PaymentQuery, PaymentsService, ReversePaymentDto } from './payments.service';
import { IdParam, type Id } from '../../common/ids';

@ApiTags('payments')
@ApiBearerAuth()
@Controller()
class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly pdf: PdfService,
    private readonly storage: StorageService,
  ) {}

  @Get('payments')
  @RequirePermission('payment.view')
  list(@Tenant() t: TenantContext, @Query() q: PaymentQuery) {
    return this.payments.list(t, q);
  }

  @Get('payments/:id')
  @RequirePermission('payment.view')
  get(@Tenant() t: TenantContext, @IdParam() id: Id) {
    return this.payments.get(t, id);
  }

  /** Receipt (receivables) or voucher (payables) PDF, streamed through the API. */
  @Get('payments/:id/pdf')
  @RequirePermission('payment.view')
  async pdfFile(@Tenant() t: TenantContext, @IdParam() id: Id, @Res() res: Response) {
    const p = await this.payments.get(t, id);
    const body = await this.pdf.receiptPdf(p.id, t.companyId);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${p.receiptNumber ?? 'payment'}.pdf"` }).send(body);
  }

  @Get('invoices/:id/payments')
  @RequirePermission('payment.view')
  listForInvoice(@Tenant() t: TenantContext, @IdParam() id: Id) {
    return this.payments.listForInvoice(t, id);
  }

  @Post('invoices/:id/payments')
  @RequirePermission('payment.create')
  create(@Tenant() t: TenantContext, @IdParam() id: Id, @Body() dto: CreatePaymentDto) {
    return this.payments.create(t, id, dto);
  }

  @Post('payments/:id/refund')
  @HttpCode(200)
  @RequirePermission('payment.refund')
  refund(@Tenant() t: TenantContext, @IdParam() id: Id, @Body() dto: ReversePaymentDto) {
    return this.payments.refund(t, id, dto);
  }

  @Post('payments/:id/reverse')
  @HttpCode(200)
  @RequirePermission('payment.refund')
  reverse(@Tenant() t: TenantContext, @IdParam() id: Id, @Body() dto: ReversePaymentDto) {
    return this.payments.reverse(t, id, dto);
  }
}

@Module({ imports: [InvoicesModule, PdfModule], controllers: [PaymentsController], providers: [PaymentsService] })
export class PaymentsModule {}
