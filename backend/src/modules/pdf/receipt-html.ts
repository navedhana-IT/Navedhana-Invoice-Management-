import type { RenderData } from './invoice-html';

export interface ReceiptData {
  brand: RenderData['brand'];
  logo?: string;
  title: string;
  number: string;
  status: string;
  paidAt: Date;
  amount: string;
  currency: string;
  method: string;
  reference?: string | null;
  notes?: string | null;
  party: { label: string; name: string; address?: string | null; gstin?: string | null };
  invoice: { number: string; total: string; balance: string };
}

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const nl = (v: unknown) => esc(v).replace(/\n/g, '<br/>');

/** A5 receipt (money in) or voucher (money out) for a single payment. */
export function renderReceiptHtml(d: ReceiptData): string {
  const money = (v: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: d.currency || 'INR' }).format(Number(v));
  const row = (k: string, v: unknown) => (v ? `<tr><th>${esc(k)}</th><td>${nl(v)}</td></tr>` : '');
  const when = new Date(d.paidAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
    @page { size: A5; margin: 14mm; }
    body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #0f172a; font-size: 11px; }
    header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 10px; }
    .logo { max-height: 48px; max-width: 160px; }
    h1 { font-size: 16px; margin: 0; text-transform: uppercase; letter-spacing: .06em; }
    h2 { font-size: 13px; margin: 0 0 2px; }
    .muted { color: #64748b; }
    .amount { margin: 18px 0; padding: 14px; background: #f1f5f9; border-radius: 8px; text-align: center; }
    .amount b { display: block; font-size: 22px; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; color: #64748b; font-weight: 500; width: 38%; padding: 5px 0; vertical-align: top; }
    td { padding: 5px 0; }
    .status { display: inline-block; padding: 2px 8px; border-radius: 99px; background: ${d.status === 'SUCCESS' ? '#dcfce7' : '#fee2e2'}; color: ${d.status === 'SUCCESS' ? '#166534' : '#991b1b'}; font-weight: 600; font-size: 10px; }
    footer { margin-top: 28px; display: flex; justify-content: space-between; color: #64748b; font-size: 9px; }
  </style></head><body>
    <header>
      <div>${d.logo ? `<img class="logo" src="${esc(d.logo)}"/>` : ''}<h2>${esc(d.brand.service.displayName)}</h2>
        <div class="muted">${nl(d.brand.service.address)}</div>
        ${d.brand.service.gstin ? `<div class="muted">GSTIN ${esc(d.brand.service.gstin)}</div>` : ''}</div>
      <div style="text-align:right"><h1>${esc(d.title)}</h1><div>${esc(d.number)}</div><div class="muted">${when}</div>
        <div style="margin-top:6px"><span class="status">${esc(d.status === 'SUCCESS' ? 'Paid' : d.status)}</span></div></div>
    </header>
    <div class="amount"><span class="muted">Amount ${d.title === 'Payment Voucher' ? 'paid' : 'received'}</span><b>${money(d.amount)}</b></div>
    <table>
      ${row(d.party.label, d.party.name)}
      ${row('Address', d.party.address)}
      ${row('GSTIN', d.party.gstin)}
      ${row('Against invoice', d.invoice.number)}
      ${row('Invoice total', money(d.invoice.total))}
      ${row('Balance after payment', money(d.invoice.balance))}
      ${row('Payment method', d.method.replace(/_/g, ' '))}
      ${row('Reference', d.reference)}
      ${row('Notes', d.notes)}
    </table>
    <footer><span>${esc(d.brand.company.legalName)}</span><span>Computer-generated · Navedhana Ledger — A Navedhana Product</span></footer>
  </body></html>`;
}
