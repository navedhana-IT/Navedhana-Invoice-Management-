import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { chromium, type Browser } from 'playwright-core';
import { env } from '../../config/env';
import { PrismaService } from '../../infra/prisma.service';
import { StorageService } from '../../infra/storage.service';
import { renderInvoiceHtml } from './invoice-html';
import { renderReceiptHtml } from './receipt-html';
import { RenderDataService } from './render-data.service';
import type { Id } from '../../common/ids';

@Injectable()
export class PdfService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfService.name);
  private browser?: Promise<Browser>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly data: RenderDataService,
  ) {}

  async html(invoiceId: Id, companyId: Id) {
    return renderInvoiceHtml(await this.data.forInvoice(invoiceId, companyId));
  }

  async toPdf(html: string): Promise<Buffer> {
    this.browser ??= chromium.launch({ executablePath: env().CHROMIUM_PATH, args: ['--no-sandbox'] });
    const page = await (await this.browser).newPage();
    try {
      // External requests are blocked: all assets are inlined as data URIs (prevents SSRF from templates).
      await page.route('**/*', (r) => (r.request().url().startsWith('data:') ? r.continue() : r.abort()));
      await page.setContent(html, { waitUntil: 'load' });
      return Buffer.from(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
    } finally {
      await page.close();
    }
  }

  /**
   * Issued invoices get one immutable stored PDF. `force` (controlled regenerate) stores a new version
   * and keeps the previous document. Drafts are never persisted.
   */
  async generate(invoiceId: Id, companyId: Id, actorUserId?: Id, force = false) {
    const inv = await this.prisma.invoice.findFirstOrThrow({ where: { id: invoiceId, companyId } });
    if (inv.pdfDocumentId && !force) return this.prisma.document.findUniqueOrThrow({ where: { id: inv.pdfDocumentId } });
    if (inv.status === 'DRAFT') throw new Error('Draft invoices are not persisted as PDF');

    const pdf = await this.toPdf(await this.html(invoiceId, companyId));
    const fileName = `${inv.invoiceNumber}.pdf`;
    const key = this.storage.key(companyId, 'invoices', `${inv.invoiceNumber}-${Date.now()}.pdf`, inv.serviceId);
    await this.storage.put(key, pdf, 'application/pdf');
    const doc = await this.prisma.$transaction(async (tx) => {
      const d = await tx.document.create({
        data: { companyId, serviceId: inv.serviceId, kind: 'INVOICE_PDF', storageKey: key, fileName, mimeType: 'application/pdf', size: pdf.length, entityType: 'invoice', entityId: inv.id, createdById: actorUserId },
      });
      await tx.invoice.update({ where: { id: inv.id }, data: { pdfDocumentId: d.id, pdfGeneratedAt: new Date() } });
      return d;
    });
    this.logger.log(`PDF stored for invoice ${inv.invoiceNumber} (${pdf.length} bytes)`);
    return doc;
  }

  /** Receipt/voucher PDF for a payment, rendered with the current brand and party details. */
  async receiptPdf(paymentId: Id, companyId: Id) {
    return this.toPdf(renderReceiptHtml(await this.data.forReceipt(paymentId, companyId)));
  }

  async onModuleDestroy() {
    if (this.browser) await (await this.browser).close();
  }
}
