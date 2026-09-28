import { z } from 'zod';
import { toId } from '@/lib/ids';
import { GSTIN, PAN } from '@/lib/india';
import { SERIES, type Reset, type Series } from '@/lib/numbering';

const text = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`);
const required = (label: string, max = 120) => text(max).min(1, `Enter ${label}`);
const optional = (schema: z.ZodString) => z.union([z.literal(''), schema]);
const phone = optional(z.string().trim().regex(/^[+\d][\d\s-]{6,19}$/, 'Enter a valid phone number'));
const email = optional(z.string().trim().email('Enter a valid email address'));
const website = optional(z.string().trim().max(200).regex(/^(https?:\/\/)?[\w-]+(\.[\w-]+)+\S*$/i, 'Enter a valid website'));
const gstin = optional(z.string().trim().toUpperCase().regex(GSTIN, 'GSTIN has 15 characters, e.g. 29ABCDE1234F1Z5'));
const pan = optional(z.string().trim().toUpperCase().regex(PAN, 'PAN has 10 characters, e.g. ABCDE1234F'));
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a colour');

export const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;

export const NUMBER_STYLES = {
  simple: { label: 'Simple', example: 'Never resets', format: (p: string) => `{CODE}-${p}-{SEQ}`, reset: 'NEVER' },
  year: { label: 'By year', example: 'Restarts every January', format: (p: string) => `{CODE}-${p}-{YYYY}-{SEQ}`, reset: 'YEARLY' },
  fy: { label: 'By financial year', example: 'Restarts every April', format: (p: string) => `{CODE}/${p}/{FY}/{SEQ}`, reset: 'FY' },
} satisfies Record<string, { label: string; example: string; format: (p: string) => string; reset: Reset }>;
export type NumberStyle = keyof typeof NUMBER_STYLES;

export const SERIES_ABBR: Record<Series, string> = { INVOICE: 'INV', PROFORMA: 'PF', CREDIT_NOTE: 'CN', DEBIT_NOTE: 'DN', PURCHASE: 'PUR', RECEIPT: 'RCT', VOUCHER: 'PV' };

export const signupSchema = z.object({
  account: z.object({
    email: z.string().trim().min(1, 'Enter your work email').email('Enter a valid email address').max(200),
    password: z.string().regex(PASSWORD_RULE, 'Use at least 8 characters with a letter and a number').max(128),
    confirmPassword: z.string().min(1, 'Re-enter your password'),
  }).refine((a) => a.password === a.confirmPassword, { path: ['confirmPassword'], message: 'Passwords don’t match' }),
  company: z.object({
    legalName: required('the registered company name', 200),
    displayName: required('a short company name'),
    registrationNumber: text(60),
    gstin, pan,
    address: text(500), city: text(80), state: text(80), pincode: optional(z.string().trim().regex(/^\d{6}$/, 'PIN code has 6 digits')),
    country: text(80), email, phone, website,
  }),
  admin: z.object({
    fullName: required('your full name').min(2, 'Enter your full name'),
    phone,
  }),
  service: z.object({
    name: required('a brand or service name'),
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,8}$/, 'Use 2–8 letters or digits'),
    description: text(2000), email, phone, website, address: text(500),
  }),
  theme: z.object({ primaryColor: hex, accentColor: hex }),
  invoicing: z.object({
    gstRegistered: z.boolean(),
    gstin, pan,
    state: required('the state you invoice from', 60),
    style: z.enum(['simple', 'year', 'fy']),
    padding: z.coerce.number().int().min(3, 'At least 3 digits').max(8, 'At most 8 digits'),
    start: z.coerce.number().int().min(1, 'Start at 1 or more').max(999_999_999),
    terms: text(5000),
  }).superRefine((v, ctx) => {
    if (v.gstRegistered && !v.gstin) ctx.addIssue({ code: 'custom', path: ['gstin'], message: 'Enter the GSTIN for this brand' });
  }),
  planId: z.string().refine((v) => toId(v) !== undefined, 'Choose a plan'),
  acceptTerms: z.boolean().refine(Boolean, 'Please accept the terms to continue'),
});

export type SignupValues = z.input<typeof signupSchema>;

export const emptySignup = (planId = ''): SignupValues => ({
  account: { email: '', password: '', confirmPassword: '' },
  company: { legalName: '', displayName: '', registrationNumber: '', gstin: '', pan: '', address: '', city: '', state: '', pincode: '', country: 'India', email: '', phone: '', website: '' },
  admin: { fullName: '', phone: '' },
  service: { name: '', code: '', description: '', email: '', phone: '', website: '', address: '' },
  theme: { primaryColor: '#1e1b4b', accentColor: '#4f46e5' },
  invoicing: { gstRegistered: true, gstin: '', pan: '', state: '', style: 'simple', padding: 6, start: 1, terms: '' },
  planId,
  acceptTerms: false,
});

/** Numbering config for every document series from the chosen style. */
export function numberingFor(style: NumberStyle, padding: number, start: number) {
  const s = NUMBER_STYLES[style];
  return Object.fromEntries(SERIES.map((k) => [k, { format: s.format(SERIES_ABBR[k]), padding, reset: s.reset, ...(k === 'INVOICE' && { start }) }])) as
    Record<Series, { format: string; padding: number; reset: Reset; start?: number }>;
}

/** Drops empty strings so optional server-side validators don't reject them. */
function clean<T>(v: T): T {
  if (Array.isArray(v)) return v.map(clean) as T;
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '' && x !== undefined).map(([k, x]) => [k, clean(x)])) as T;
  }
  return v;
}

/** Shapes validated wizard values into the `POST /auth/signup` body. */
export function toSignupPayload(raw: SignupValues) {
  const v = signupSchema.parse(raw);
  const inv = v.invoicing;
  return clean({
    account: { fullName: v.admin.fullName, email: v.account.email.toLowerCase(), password: v.account.password, phone: v.admin.phone },
    company: { ...v.company, state: v.company.state || inv.state },
    service: {
      ...v.service,
      displayName: v.service.name,
      gstin: inv.gstRegistered ? inv.gstin : '',
      pan: inv.pan || v.company.pan,
      state: inv.state,
      terms: inv.terms,
      numbering: numberingFor(inv.style, inv.padding, inv.start),
    },
    theme: v.theme,
    planId: toId(v.planId),
    acceptTerms: v.acceptTerms,
  });
}
