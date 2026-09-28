import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });

/** Display only: amounts arrive as decimal strings computed by the backend. */
export const money = (v?: string | number | null) => inr.format(Number(v ?? 0));
export const moneyCompact = (v?: string | number | null) => `₹${compact.format(Number(v ?? 0))}`;

/** Date-only business fields arrive as UTC midnight; render those as calendar dates so they never shift a day. */
export const date = (v?: string | Date | null) => {
  if (!v) return '—';
  const d = new Date(v);
  const calendar = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', ...(calendar && { timeZone: 'UTC' }) });
};

export const dateTime = (v?: string | Date | null) =>
  v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export const titleCase = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const today = () => new Date().toISOString().slice(0, 10);

/** Form -> API body: blank strings are dropped (create) or sent as null to clear the field (update). */
export function clean<T extends Record<string, unknown>>(v: T, forUpdate = false): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    if (x && typeof x === 'object' && !Array.isArray(x)) {
      const inner = clean(x as Record<string, unknown>);
      if (Object.keys(inner).length) out[k] = inner;
    } else if (x === '' || x === undefined) {
      if (forUpdate) out[k] = null;
    } else out[k] = typeof x === 'string' ? x.trim() : x;
  }
  return out as Partial<T>;
}
