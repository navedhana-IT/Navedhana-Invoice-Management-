import { BadRequestException } from '@nestjs/common';
import type { InvoiceType, Prisma } from '@prisma/client';
import { z } from 'zod';
import type { Id } from '../../common/ids';

/**
 * Per-service document numbering. Numbers are generated only here, inside the issuing transaction.
 * Formats must contain {CODE} (unique per company) so services never collide on the company-wide
 * unique (companyId, invoiceNumber) constraint.
 */
export const SERIES = ['INVOICE', 'PROFORMA', 'CREDIT_NOTE', 'DEBIT_NOTE', 'PURCHASE', 'RECEIPT', 'VOUCHER'] as const;
export type Series = (typeof SERIES)[number];
export const TOKENS = ['CODE', 'YYYY', 'YY', 'MM', 'FY', 'SEQ'] as const;

const DEFAULT_FORMAT: Record<Series, string> = {
  INVOICE: '{CODE}-INV-{SEQ}',
  PROFORMA: '{CODE}-PF-{SEQ}',
  CREDIT_NOTE: '{CODE}-CN-{SEQ}',
  DEBIT_NOTE: '{CODE}-DN-{SEQ}',
  PURCHASE: '{CODE}-PUR-{SEQ}',
  RECEIPT: '{CODE}-RCT-{SEQ}',
  VOUCHER: '{CODE}-PV-{SEQ}',
};

const seriesSchema = z.object({
  format: z.string().trim().min(1).max(40)
    .regex(/^[A-Za-z0-9/_\-. {}]+$/, 'Only letters, digits, / _ - . and tokens')
    .refine((f) => [...f.matchAll(/\{(\w+)\}/g)].every((m) => (TOKENS as readonly string[]).includes(m[1])), 'Unknown token')
    .refine((f) => f.includes('{SEQ}') && f.includes('{CODE}'), 'Format must contain {CODE} and {SEQ}'),
  padding: z.number().int().min(1).max(10),
  start: z.number().int().min(1).max(999_999_999),
  reset: z.enum(['NEVER', 'YEARLY', 'FY']),
});
export type SeriesConfig = z.infer<typeof seriesSchema>;
export type Numbering = Record<Series, SeriesConfig>;

const numberingSchema = z.record(z.enum(SERIES), seriesSchema.partial().strict());

export const CODE_PATTERN = /^[A-Z0-9]{2,8}$/;

export function resolveNumbering(stored: unknown): Numbering {
  const s = (stored ?? {}) as Partial<Record<Series, Partial<SeriesConfig>>>;
  return Object.fromEntries(SERIES.map((k) => [k, { format: DEFAULT_FORMAT[k], padding: 6, start: 1, reset: 'NEVER', ...(s[k] ?? {}) }])) as Numbering;
}

/** Validates a (partial) numbering update merged over the current config. Throws 400 with a readable message. */
export function validateNumbering(current: unknown, patch: unknown): Numbering {
  const parsed = numberingSchema.safeParse(patch);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  const merged = resolveNumbering(current);
  for (const [k, v] of Object.entries(parsed.data)) Object.assign(merged[k as Series], v);
  for (const k of SERIES) {
    const r = seriesSchema.safeParse(merged[k]);
    if (!r.success) throw new BadRequestException(`${k}: ${r.error.issues[0].message}`);
  }
  const formats = SERIES.map((k) => merged[k].format);
  if (new Set(formats).size !== formats.length) throw new BadRequestException('Each document series needs a different format');
  return merged;
}

export function seriesFor(type: InvoiceType): Series {
  switch (type) {
    case 'PROFORMA': return 'PROFORMA';
    case 'PURCHASE': return 'PURCHASE';
    case 'CREDIT_NOTE': return 'CREDIT_NOTE';
    case 'DEBIT_NOTE': return 'DEBIT_NOTE';
    default: return 'INVOICE';
  }
}

/** Year and month of `date` in the company's timezone. */
function ymd(date: Date, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(date).map((p) => [p.type, p.value]));
  return { year: Number(parts.year), month: Number(parts.month) };
}

/** Indian financial year (April-March), e.g. "2026-27". */
function financialYear(year: number, month: number) {
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export function periodKey(cfg: SeriesConfig, date: Date, timeZone: string) {
  const { year, month } = ymd(date, timeZone);
  return cfg.reset === 'YEARLY' ? String(year) : cfg.reset === 'FY' ? financialYear(year, month) : '';
}

export function formatNumber(cfg: SeriesConfig, code: string, seq: number, date: Date, timeZone: string) {
  const { year, month } = ymd(date, timeZone);
  const values: Record<string, string> = {
    CODE: code, YYYY: String(year), YY: String(year % 100).padStart(2, '0'), MM: String(month).padStart(2, '0'),
    FY: financialYear(year, month), SEQ: String(seq).padStart(cfg.padding, '0'),
  };
  return cfg.format.replace(/\{(\w+)\}/g, (_, t: string) => values[t] ?? '');
}

/** Atomically claims the next number. A raised `start` takes effect on the next claim; it never goes backwards. */
export async function claimNumber(
  tx: Prisma.TransactionClient,
  svc: { id: Id; code: string; numbering: unknown },
  series: Series,
  date: Date,
  timeZone: string,
) {
  const cfg = resolveNumbering(svc.numbering)[series];
  const period = periodKey(cfg, date, timeZone);
  const [row] = await tx.$queryRaw<{ seq: number }[]>`
    INSERT INTO "invoice_sequences" ("serviceId", "series", "period", "next")
    VALUES (${svc.id}::bigint, ${series}, ${period}, ${cfg.start + 1})
    ON CONFLICT ("serviceId", "series", "period")
    DO UPDATE SET "next" = GREATEST("invoice_sequences"."next", EXCLUDED."next" - 1) + 1
    RETURNING "next" - 1 AS seq`;
  return formatNumber(cfg, svc.code, Number(row.seq), date, timeZone);
}

/** Next number per series without claiming it. */
export async function previewNumbers(
  db: Prisma.TransactionClient,
  svc: { id: Id; code: string; numbering: unknown },
  timeZone: string,
  numbering = resolveNumbering(svc.numbering),
  date = new Date(),
) {
  const rows = await db.invoiceSequence.findMany({ where: { serviceId: svc.id } });
  return Object.fromEntries(SERIES.map((s) => {
    const cfg = numbering[s];
    const current = rows.find((r) => r.series === s && r.period === periodKey(cfg, date, timeZone))?.next ?? 1;
    return [s, formatNumber(cfg, svc.code, Math.max(current, cfg.start), date, timeZone)];
  })) as Record<Series, string>;
}

export function codeFromName(name: string) {
  const initials = name.split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w[0]).join('').toUpperCase();
  return (initials.length >= 2 ? initials : name.replace(/[^A-Za-z0-9]/g, '').toUpperCase()).slice(0, 6).padEnd(2, 'X');
}
