import type { TemplateConfig } from '../invoice-templates/template-config.schema';

export interface RenderLine { description: string; hsnSac?: string | null; quantity: string; unitPrice: string; discount: string; taxRate: string; taxAmount: string; lineTotal: string }
export interface RenderStage { stageNumber: number; description?: string | null; amount: string; dueType: string; dueDate?: Date | null; paidAmount: string; status: string }

export interface RenderData {
  config: TemplateConfig;
  brand: {
    company: { legalName: string; gstin?: string | null; address?: string | null };
    service: { displayName: string; tagline?: string | null; address?: string | null; email?: string | null; phone?: string | null; website?: string | null; gstin?: string | null; pan?: string | null; bankDetails?: Record<string, string>; terms?: string | null };
  };
  assets: Partial<Record<'logo' | 'headerLogo' | 'footerLogo' | 'signature', string>> & { images?: Record<string, string> };
  qrDataUri?: string;
  invoice: {
    number: string; title: string; status: string; issueDate?: Date | null; dueDate?: Date | null; currency: string; taxMode: string;
    notes?: string | null; terms?: string | null; subtotal: string; discountTotal: string; taxTotal: string; total: string; paidAmount: string; balanceAmount: string;
    cgst: string; sgst: string; igst: string;
    party: { label: string; name: string; address?: string | null; gstin?: string | null; email?: string | null; phone?: string | null; state?: string | null };
    customFields: { key: string; label: string; value: string }[];
    items: RenderLine[];
    schedule: RenderStage[];
  };
}

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const nl = (v: unknown) => esc(v).replace(/\n/g, '<br/>');
const date = (d?: Date | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '-');
const img = (src?: string, cls = 'logo') => (src ? `<img class="${cls}" src="${esc(src)}"/>` : '');

export function renderInvoiceHtml(d: RenderData): string {
  const { config: c, invoice: inv, brand } = d;
  const money = (v: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: inv.currency || 'INR' }).format(Number(v));
  const kv = (rows: [string, unknown][]) =>
    rows.filter(([, v]) => v).map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><b>${nl(v)}</b></div>`).join('');

  const sections: Record<string, (props: Record<string, unknown>) => string> = {
    logo: () => img(d.assets.logo),
    company_header: () => `<h2>${esc(brand.service.displayName)}</h2><div class="muted">${nl(brand.service.address)}</div>`,
    invoice_details: () => `<h3>${esc(inv.title)}</h3>${kv([['Number', inv.number], ['Status', inv.status], ['Issue date', date(inv.issueDate)], ['Due date', inv.dueDate ? date(inv.dueDate) : '']])}`,
    customer_details: () => `<h4>${esc(inv.party.label)}</h4><b>${esc(inv.party.name)}</b><div class="muted">${nl(inv.party.address)}</div>${kv([['GSTIN', inv.party.gstin], ['State', inv.party.state], ['Email', inv.party.email], ['Phone', inv.party.phone]])}`,
    items_table: () => `<table><thead><tr><th>#</th><th>Description</th><th>HSN/SAC</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Disc.</th><th class="r">Tax</th><th class="r">Amount</th></tr></thead><tbody>${inv.items
      .map((l, i) => `<tr><td>${i + 1}</td><td>${nl(l.description)}</td><td>${esc(l.hsnSac)}</td><td class="r">${esc(Number(l.quantity))}</td><td class="r">${money(l.unitPrice)}</td><td class="r">${money(l.discount)}</td><td class="r">${esc(Number(l.taxRate))}%</td><td class="r">${money(l.lineTotal)}</td></tr>`)
      .join('')}</tbody></table>`,
    tax_table: () => `<table class="narrow"><tbody>${inv.taxMode === 'INTER_STATE' ? `<tr><td>IGST</td><td class="r">${money(inv.igst)}</td></tr>` : `<tr><td>CGST</td><td class="r">${money(inv.cgst)}</td></tr><tr><td>SGST</td><td class="r">${money(inv.sgst)}</td></tr>`}</tbody></table>`,
    totals: () => `<table class="narrow totals"><tbody><tr><td>Subtotal</td><td class="r">${money(inv.subtotal)}</td></tr>${Number(inv.discountTotal) ? `<tr><td>Discount</td><td class="r">- ${money(inv.discountTotal)}</td></tr>` : ''}<tr><td>Tax</td><td class="r">${money(inv.taxTotal)}</td></tr><tr class="grand"><td>Total</td><td class="r">${money(inv.total)}</td></tr>${Number(inv.paidAmount) ? `<tr><td>Paid</td><td class="r">${money(inv.paidAmount)}</td></tr><tr><td>Balance</td><td class="r">${money(inv.balanceAmount)}</td></tr>` : ''}</tbody></table>`,
    payment_schedule: () => (inv.schedule.length > 1 || inv.schedule[0]?.dueDate
      ? `<h4>Payment schedule</h4><table><thead><tr><th>Stage</th><th>Description</th><th>Due</th><th class="r">Amount</th><th class="r">Paid</th><th>Status</th></tr></thead><tbody>${inv.schedule
          .map((s) => `<tr><td>${s.stageNumber}</td><td>${esc(s.description)}</td><td>${s.dueDate ? date(s.dueDate) : s.dueType === 'NONE' ? 'On request' : '-'}</td><td class="r">${money(s.amount)}</td><td class="r">${money(s.paidAmount)}</td><td>${esc(s.status)}</td></tr>`)
          .join('')}</tbody></table>`
      : ''),
    bank_details: () => {
      const b = brand.service.bankDetails ?? {};
      return Object.keys(b).length ? `<h4>Bank details</h4>${kv([['Account name', b.accountName], ['Account no.', b.accountNumber], ['IFSC', b.ifsc], ['Bank', b.bankName], ['Branch', b.branch], ['UPI', b.upiId]])}` : '';
    },
    terms: () => (inv.terms ? `<h4>Terms &amp; conditions</h4><div class="muted small">${nl(inv.terms)}</div>` : ''),
    signature: () => `<div class="sign">${img(d.assets.signature, 'signature')}<div>Authorised signatory</div><div class="muted">for ${esc(brand.service.displayName)}</div></div>`,
    custom_text: (p) => `<div>${nl(p.text)}</div>`,
    custom_image: (p) => img(d.assets.images?.[String(p.imageKey)], 'custom-img'),
    custom_field: (p) => {
      const f = inv.customFields.find((x) => x.key === p.fieldKey);
      return f ? kv([[f.label, f.value]]) : '';
    },
    qr_code: (p) => {
      const src = d.assets.images?.[String(p.imageKey)] ?? d.qrDataUri;
      return src && Number(inv.balanceAmount) > 0 ? `<div class="qr"><img src="${esc(src)}"/><div class="muted small">Scan to pay</div></div>` : '';
    },
    footer: () => `<div class="muted small">${nl(c.footer.text)}</div>`,
  };

  const headerLogo = c.header.logo === 'header_logo' ? d.assets.headerLogo : c.header.logo === 'service_logo' ? d.assets.logo : undefined;
  const body = c.sections.map((s) => `<section class="${s.width}">${sections[s.type]?.(s.props ?? {}) ?? ''}</section>`).join('');
  const s = brand.service;
  const h = c.header;
  const f = c.footer;

  const header = columns([
    [h.logoPosition, headerLogo ? `<img class="hlogo" src="${esc(headerLogo)}"/>` : ''],
    [h.nameAlign, h.showCompanyName ? `<h2 class="brand">${esc(s.displayName)}</h2>${s.tagline ? `<div class="muted small">${esc(s.tagline)}</div>` : ''}` : ''],
    [h.contactAlign, `<div class="contact">${[...(h.showContact ? [nl(s.address), esc(s.phone), esc(s.email), esc(s.website)] : []), s.gstin ? `GSTIN: ${esc(s.gstin)}` : ''].filter(Boolean).join('<br/>')}</div>`],
  ]);
  const footerText = [
    f.showTerms && !c.sections.some((x) => x.type === 'terms') && inv.terms ? nl(inv.terms) : '',
    f.text && !c.sections.some((x) => x.type === 'footer') ? nl(f.text) : '',
  ].filter(Boolean).join('<br/>');
  const footer = columns([
    [f.textAlign, footerText ? `<div class="ftext muted">${footerText}</div>` : ''],
    [f.contactAlign, f.showContact ? `<div class="fcontact muted">${[s.address?.replace(/\s*\n\s*/g, ', '), s.phone, s.email, s.website].filter(Boolean).map((x) => esc(x)).join(' · ')}</div>` : ''],
    [f.logoPosition, f.logo === 'footer_logo' && d.assets.footerLogo ? `<img class="flogo" src="${esc(d.assets.footerLogo)}"/>` : ''],
  ]);

  return `<!doctype html><html><head><meta charset="utf-8"/><style>
@page { size: ${c.page.size} ${c.page.orientation}; margin: ${PAGE_MARGIN_MM}mm; }
* { box-sizing: border-box; } body { font-family: ${esc(c.theme.fontFamily)}; font-size: ${c.theme.baseFontSize}px; color: #1e293b; margin: 0; }
.sheet { display: flex; flex-direction: column; ${f.pinToBottom ? `min-height: ${contentHeightMm(c.page)}mm;` : ''} } .sheet > main { flex: 1 0 auto; align-content: flex-start; }
.cols { display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: start; }
.col { display: flex; flex-direction: column; gap: 4px; min-width: 0; } .col.left { align-items: flex-start; text-align: left; } .col.center { align-items: center; text-align: center; } .col.right { align-items: flex-end; text-align: right; }
header { padding-bottom: 10px; margin-bottom: 14px; ${h.divider ? `border-bottom: 3px solid ${c.theme.accentColor};` : ''} }
.hlogo { max-height: ${h.logoSize}px; max-width: ${h.logoSize * 3.5}px; object-fit: contain; } .brand { font-size: ${h.nameSize}px; } .contact { font-size: ${h.contactSize}px; }
.flogo { max-height: ${f.logoSize}px; max-width: ${f.logoSize * 3.5}px; object-fit: contain; } .ftext { font-size: ${f.textSize}px; } .fcontact { font-size: ${f.contactSize}px; }
h2, h3 { margin: 0 0 4px; color: ${c.theme.primaryColor}; } h4 { margin: 10px 0 4px; color: ${c.theme.primaryColor}; }
.logo { max-height: 60px; max-width: 200px; } .signature { max-height: 50px; } .custom-img { max-width: 100%; max-height: 160px; }
main { display: flex; flex-wrap: wrap; gap: 12px 4%; } section.full { width: 100%; } section.half { width: 48%; }
table { width: 100%; border-collapse: collapse; margin-top: 6px; } th { background: ${c.theme.primaryColor}; color: #fff; text-align: left; padding: 6px; font-weight: 600; }
td { padding: 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; } .r { text-align: right; }
table.narrow { width: 45%; margin-left: auto; } .totals .grand td { font-weight: 700; font-size: 1.15em; border-top: 2px solid ${c.theme.primaryColor}; }
.kv { display: flex; gap: 8px; } .kv span { color: #64748b; min-width: 90px; } .muted { color: #64748b; } .small { font-size: 0.85em; }
.sign { text-align: right; margin-top: 20px; } .qr img { width: 110px; }
footer { margin-top: 18px; border-top: 1px solid #e2e8f0; padding-top: 8px; break-inside: avoid; }
.generated { margin: 6px 0 0; text-align: center; color: #94a3b8; font-size: 8px; }
</style></head><body><div class="sheet">
<header class="cols">${header}</header>
<main>${body}</main>
<footer><div class="cols">${footer}</div><p class="generated">Generated with Navedhana Ledger — A Navedhana Product</p></footer>
</div></body></html>`;
}

const PAGE_MARGIN_MM = 14;
const PAGE_MM = { A4: [210, 297], LETTER: [215.9, 279.4] } as const;

/** Printable height of one page; a hair under so the pinned footer never spills onto a blank page. */
function contentHeightMm(page: TemplateConfig['page']) {
  const [w, h] = PAGE_MM[page.size];
  return (page.orientation === 'portrait' ? h : w) - 2 * PAGE_MARGIN_MM - 1;
}

type Align = 'left' | 'center' | 'right';

/** Places each piece in the left, centre or right column; pieces sharing a column stack in order. */
function columns(pieces: [Align, string][]) {
  return (['left', 'center', 'right'] as const)
    .map((pos) => `<div class="col ${pos}">${pieces.filter(([p, html]) => p === pos && html).map(([, html]) => html).join('')}</div>`)
    .join('');
}
