/** Mirrors backend `modules/invoices/numbering.ts` for live previews; the server remains the source of truth. */
export const SERIES = ['INVOICE', 'PROFORMA', 'CREDIT_NOTE', 'DEBIT_NOTE', 'PURCHASE', 'RECEIPT', 'VOUCHER'] as const;
export type Series = (typeof SERIES)[number];
export type Reset = 'NEVER' | 'YEARLY' | 'FY';
export type SeriesConfig = { format: string; padding: number; start: number; reset: Reset };

export const SERIES_LABELS: Record<Series, string> = {
  INVOICE: 'Tax invoice', PROFORMA: 'Proforma', CREDIT_NOTE: 'Credit note', DEBIT_NOTE: 'Debit note',
  PURCHASE: 'Purchase bill', RECEIPT: 'Receipt', VOUCHER: 'Payment voucher',
};

export const DEFAULT_FORMAT: Record<Series, string> = {
  INVOICE: '{CODE}-INV-{SEQ}', PROFORMA: '{CODE}-PF-{SEQ}', CREDIT_NOTE: '{CODE}-CN-{SEQ}', DEBIT_NOTE: '{CODE}-DN-{SEQ}',
  PURCHASE: '{CODE}-PUR-{SEQ}', RECEIPT: '{CODE}-RCT-{SEQ}', VOUCHER: '{CODE}-PV-{SEQ}',
};

export const TOKENS: [token: string, meaning: string][] = [
  ['{CODE}', 'Brand code'], ['{SEQ}', 'Running number'], ['{YYYY}', 'Year'], ['{YY}', 'Short year'], ['{MM}', 'Month'], ['{FY}', 'Financial year'],
];

export const RESET_LABELS: Record<Reset, string> = { NEVER: 'Never', YEARLY: 'Every calendar year', FY: 'Every financial year (April)' };

export const resolveSeries = (stored: Partial<Record<Series, Partial<SeriesConfig>>> | null | undefined, s: Series): SeriesConfig =>
  ({ format: DEFAULT_FORMAT[s], padding: 6, start: 1, reset: 'NEVER', ...(stored?.[s] ?? {}) });

/** Same rules as the server: allowed characters, known tokens, and both {CODE} and {SEQ} present. */
export function formatError(format: string): string | null {
  if (!format.trim()) return 'Enter a format';
  if (format.length > 40) return 'Keep the format under 40 characters';
  if (!/^[A-Za-z0-9/_\-. {}]+$/.test(format)) return 'Use letters, digits, / _ - . and tokens only';
  const known = TOKENS.map(([t]) => t.slice(1, -1));
  if ([...format.matchAll(/\{(\w+)\}/g)].some((m) => !known.includes(m[1]))) return 'Unknown token';
  if (!format.includes('{SEQ}') || !format.includes('{CODE}')) return 'Include both {CODE} and {SEQ}';
  return null;
}

function financialYear(year: number, month: number) {
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export function formatNumber(cfg: Pick<SeriesConfig, 'format' | 'padding'>, code: string, seq: number, date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const values: Record<string, string> = {
    CODE: code || 'CODE', YYYY: String(year), YY: String(year % 100).padStart(2, '0'), MM: String(month).padStart(2, '0'),
    FY: financialYear(year, month), SEQ: String(seq).padStart(Math.min(Math.max(cfg.padding || 1, 1), 10), '0'),
  };
  return cfg.format.replace(/\{(\w+)\}/g, (_, t: string) => values[t] ?? '');
}

/** Suggested brand code from a name, e.g. "Lotus Solar Power" → "LSP". */
export function codeFromName(name: string) {
  const initials = name.split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w[0]).join('').toUpperCase();
  const code = (initials.length >= 2 ? initials : name.replace(/[^A-Za-z0-9]/g, '').toUpperCase()).slice(0, 6);
  return code.length >= 2 ? code : code ? code.padEnd(2, 'X') : '';
}
