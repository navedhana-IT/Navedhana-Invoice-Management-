import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InvoiceType, Prisma } from '@prisma/client';
import * as QRCode from 'qrcode';
import { D, sum } from '../../common/money';
import { PrismaService } from '../../infra/prisma.service';
import { StorageService } from '../../infra/storage.service';
import { defaultTemplateConfig, sectionImageKeys, templateConfigSchema, type TemplateConfig } from '../invoice-templates/template-config.schema';
import { previewNumbers } from '../invoices/numbering';
import type { RenderData } from './invoice-html';
import type { ReceiptData } from './receipt-html';
import type { Id } from '../../common/ids';

const TITLES: Record<InvoiceType, string> = {
  SALES: 'Invoice', TAX: 'Tax Invoice', PROFORMA: 'Proforma Invoice', PURCHASE: 'Purchase Invoice', CREDIT_NOTE: 'Credit Note', DEBIT_NOTE: 'Debit Note',
};

type Brand = RenderData['brand'] & { service: { logoKey?: string | null; headerLogoKey?: string | null; footerLogoKey?: string | null; signatureKey?: string | null } };

/** Collects everything needed to render an invoice: frozen template + branding for issued invoices, live data for drafts. */
@Injectable()
export class RenderDataService {
  private readonly logger = new Logger(RenderDataService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async forInvoice(invoiceId: Id, companyId: Id): Promise<RenderData> {
    const inv = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, companyId },
      include: {
        items: { orderBy: { position: 'asc' } },
        schedule: { orderBy: { stageNumber: 'asc' } },
        customer: true,
        vendor: true,
        service: { include: { company: true } },
        payments: { where: { status: 'SUCCESS' }, orderBy: { paidAt: 'asc' } },
      },
    });
    if (!inv) throw new NotFoundException('Invoice not found');

    // Invoices always render with the current brand, party and default template; issue-time snapshots are only a fallback for deleted parties.
    const config = await this.liveConfig(inv.serviceId, inv.service.defaultTemplateId);
    const brand = liveBrand(inv.service);
    const defs = await this.prisma.customFieldDefinition.findMany({ where: { serviceId: inv.serviceId } });
    const values = inv.customFieldValues as Record<string, unknown>;
    const live = inv.customer ?? inv.vendor;
    const snap = inv.partySnapshot as { name: string; address?: string | null; gstin?: string | null; email?: string | null; phone?: string | null; state?: string | null } | null;
    const party = (live && { ...live, address: inv.customer?.billingAddress ?? inv.vendor?.address }) ?? snap;
    const upi = (brand.service.bankDetails ?? {}).upiId;

    return {
      config,
      brand,
      assets: await this.assets(companyId, brand, config),
      qrDataUri: upi && D(inv.balanceAmount).gt(0) && config.sections.some((s) => s.type === 'qr_code')
        ? await QRCode.toDataURL(`upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(brand.service.displayName)}&am=${inv.balanceAmount.toFixed(2)}&cu=${inv.currency}&tn=${encodeURIComponent(inv.invoiceNumber ?? 'Invoice')}`, { margin: 1, width: 220 })
        : undefined,
      invoice: {
        number: inv.invoiceNumber ?? 'DRAFT', title: TITLES[inv.invoiceType], status: inv.status, issueDate: inv.issueDate, dueDate: inv.dueDate,
        currency: inv.currency, taxMode: inv.taxMode, notes: inv.notes, terms: inv.terms,
        subtotal: inv.subtotal.toFixed(2), discountTotal: inv.discountTotal.toFixed(2), taxTotal: inv.taxTotal.toFixed(2), total: inv.total.toFixed(2),
        paidAmount: inv.paidAmount.toFixed(2), balanceAmount: inv.balanceAmount.toFixed(2),
        cgst: sum(inv.items.map((i) => i.cgst)).toFixed(2), sgst: sum(inv.items.map((i) => i.sgst)).toFixed(2), igst: sum(inv.items.map((i) => i.igst)).toFixed(2),
        party: { label: inv.direction === 'PAYABLE' ? 'Vendor' : 'Bill to', name: party?.name ?? '-', address: party?.address, gstin: party?.gstin, email: party?.email, phone: party?.phone, state: party?.state },
        customFields: defs.filter((f) => values[f.key] !== undefined).map((f) => ({ key: f.key, label: f.label, value: String(values[f.key]) })),
        items: inv.items.map((i) => ({ description: i.description, hsnSac: i.hsnSac, quantity: i.quantity.toString(), unitPrice: i.unitPrice.toFixed(2), discount: i.discount.toFixed(2), taxRate: i.taxRate.toString(), taxAmount: i.taxAmount.toFixed(2), lineTotal: i.lineTotal.toFixed(2) })),
        schedule: inv.schedule.map((s) => ({ stageNumber: s.stageNumber, description: s.description, amount: s.amount.toFixed(2), dueType: s.dueType, dueDate: s.dueDate, paidAmount: s.paidAmount.toFixed(2), status: s.status })),
        payments: inv.payments.map((p) => ({
          amount: p.amount.toFixed(2),
          method: p.method.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
          receiptNumber: p.receiptNumber,
          paidAt: p.paidAt,
          reference: p.reference,
        })),
      },
    };
  }

  /** Sample invoice rendered with a draft config, for the template builder preview. */
  async sample(serviceId: Id, companyId: Id, config: TemplateConfig): Promise<RenderData> {
    const service = await this.prisma.service.findFirstOrThrow({ where: { id: serviceId, companyId }, include: { company: true } });
    const brand = liveBrand(service);
    const defs = await this.prisma.customFieldDefinition.findMany({ where: { serviceId } });
    const numbers = await previewNumbers(this.prisma, service, service.company.timezone);
    return {
      config, brand, assets: await this.assets(companyId, brand, config),
      invoice: {
        number: numbers.INVOICE, title: 'Tax Invoice', status: 'ISSUED', issueDate: new Date(), dueDate: null, currency: 'INR', taxMode: 'INTRA_STATE',
        terms: service.terms, subtotal: '300000.00', discountTotal: '0.00', taxTotal: '54000.00', total: '354000.00', paidAmount: '30000.00', balanceAmount: '324000.00',
        cgst: '27000.00', sgst: '27000.00', igst: '0.00',
        party: { label: 'Bill to', name: 'Sample Customer Pvt Ltd', address: '12 MG Road\nBengaluru 560001', gstin: '29ABCDE1234F1Z5', state: 'Karnataka' },
        customFields: defs.map((f) => ({ key: f.key, label: f.label, value: f.type === 'DROPDOWN' ? f.options[0] ?? '-' : `Sample ${f.label}` })),
        items: [{ description: 'Project implementation', hsnSac: '998314', quantity: '1', unitPrice: '300000.00', discount: '0.00', taxRate: '18', taxAmount: '54000.00', lineTotal: '354000.00' }],
        schedule: [
          { stageNumber: 1, description: 'Advance', amount: '118000.00', dueType: 'FIXED', dueDate: new Date(Date.now() + 12 * 86_400_000), paidAmount: '0.00', status: 'PENDING' },
          { stageNumber: 2, description: 'On completion', amount: '236000.00', dueType: 'FIXED', dueDate: new Date(Date.now() + 43 * 86_400_000), paidAmount: '0.00', status: 'PENDING' },
        ],
        payments: [
          {
            amount: '30000.00',
            method: 'Bank Transfer',
            receiptNumber: 'LSP-PV-000003',
            paidAt: new Date('2026-09-29T12:00:00Z'),
            reference: 'INB/NEFT/AXODH27220773433',
          },
        ],
      },
    };
  }

  async forReceipt(paymentId: Id, companyId: Id): Promise<ReceiptData> {
    const p = await this.prisma.payment.findFirst({
      where: { id: paymentId, companyId },
      include: { invoice: { include: { customer: true, vendor: true, service: { include: { company: true } } } } },
    });
    if (!p) throw new NotFoundException('Payment not found');
    const inv = p.invoice;
    const brand = liveBrand(inv.service);
    const snap = inv.partySnapshot as { name: string; address?: string | null; gstin?: string | null } | null;
    const live = inv.customer ?? inv.vendor;
    const payable = inv.direction === 'PAYABLE';
    return {
      brand, logo: await this.dataUri(companyId, brand.service.logoKey),
      title: payable ? 'Payment Voucher' : 'Payment Receipt', number: p.receiptNumber ?? '-', status: p.status, paidAt: p.paidAt,
      amount: p.amount.toFixed(2), currency: inv.currency, method: p.method, reference: p.reference, notes: p.notes,
      party: { label: payable ? 'Paid to' : 'Received from', name: live?.name ?? snap?.name ?? '-', address: live ? inv.customer?.billingAddress ?? inv.vendor?.address : snap?.address, gstin: live ? live.gstin : snap?.gstin },
      invoice: { number: inv.externalNumber && payable ? `${inv.invoiceNumber} (${inv.externalNumber})` : inv.invoiceNumber ?? '-', total: inv.total.toFixed(2), balance: inv.balanceAmount.toFixed(2) },
    };
  }

  private async liveConfig(serviceId: Id, templateId: Id | null): Promise<TemplateConfig> {
    const v = templateId
      ? await this.prisma.invoiceTemplateVersion.findFirst({ where: { templateId, status: 'PUBLISHED' }, orderBy: { version: 'desc' } })
      : null;
    return v ? parseConfig(v.config) : defaultTemplateConfig();
  }

  private async assets(companyId: Id, brand: Brand, config: TemplateConfig): Promise<RenderData['assets']> {
    const s = brand.service;
    const [logo, headerLogo, footerLogo, signature] = await Promise.all([s.logoKey, s.headerLogoKey, s.footerLogoKey, s.signatureKey].map((k) => this.dataUri(companyId, k)));
    const imageKeys = sectionImageKeys(config);
    // Template JSON is user-editable: only embed files this company actually uploaded.
    const owned = new Set((await this.prisma.document.findMany({ where: { companyId, storageKey: { in: imageKeys } }, select: { storageKey: true } })).map((d) => d.storageKey));
    const images: Record<string, string> = {};
    for (const k of imageKeys.filter((key) => owned.has(key))) {
      const uri = await this.dataUri(companyId, k);
      if (uri) images[k] = uri;
    }
    return { logo, headerLogo, footerLogo, signature, images };
  }

  private async dataUri(companyId: Id, key?: string | null) {
    if (!key || !key.startsWith(`companies/${companyId}/`)) return undefined;
    try {
      const buf = await this.storage.get(key);
      const mime = key.endsWith('.png') ? 'image/png' : key.endsWith('.svg') ? 'image/svg+xml' : key.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch (e) {
      this.logger.warn(`Asset ${key} unavailable: ${(e as Error).message}`);
      return undefined;
    }
  }
}

function parseConfig(json: Prisma.JsonValue): TemplateConfig {
  const r = templateConfigSchema.safeParse(json);
  return r.success ? r.data : defaultTemplateConfig();
}

function liveBrand(service: Prisma.ServiceGetPayload<{ include: { company: true } }>): Brand {
  return {
    company: { legalName: service.company.legalName, gstin: service.company.gstin, address: service.company.address },
    service: { ...service, bankDetails: service.bankDetails as Record<string, string> },
  };
}
