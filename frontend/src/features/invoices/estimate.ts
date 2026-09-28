type Line = { quantity?: string; unitPrice?: string; discount?: string; taxRate?: string };
export type TaxMode = 'INTRA_STATE' | 'INTER_STATE' | 'NONE';

/** Same rule as the server: same state (or unknown) → CGST + SGST, different states → IGST. */
export function autoTaxMode(serviceState?: string | null, partyState?: string | null): TaxMode {
  if (!serviceState || !partyState) return 'INTRA_STATE';
  return serviceState.trim().toLowerCase() === partyState.trim().toLowerCase() ? 'INTRA_STATE' : 'INTER_STATE';
}

/**
 * Live preview only, in integer paise with per-line tax rounding like the server.
 * The saved invoice always shows the backend's authoritative totals.
 */
export function estimate(lines: Line[], taxMode: TaxMode = 'INTRA_STATE') {
  let sub = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  for (const l of lines) {
    const base = Math.round(Number(l.quantity || 0) * Number(l.unitPrice || 0) * 100) - Math.round(Number(l.discount || 0) * 100);
    sub += base;
    if (taxMode === 'NONE') continue;
    const tax = Math.round((base * Number(l.taxRate || 0)) / 100);
    if (taxMode === 'INTER_STATE') igst += tax;
    else {
      const half = Math.round(tax / 2);
      cgst += half;
      sgst += tax - half;
    }
  }
  const tax = cgst + sgst + igst;
  return { subtotal: sub / 100, tax: tax / 100, cgst: cgst / 100, sgst: sgst / 100, igst: igst / 100, total: (sub + tax) / 100 };
}
