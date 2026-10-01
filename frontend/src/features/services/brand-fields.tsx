'use client';
import type { UseFormRegister } from 'react-hook-form';
import { Field, Input, Textarea } from '@/components/ui';
import { INDIAN_STATES } from '@/lib/india';
import type { Series, SeriesConfig } from '@/lib/numbering';
import type { Id } from '@/lib/ids';

export type BrandForm = {
  name: string; displayName: string; tagline: string; description: string; email: string; phone: string; website: string; address: string;
  gstin: string; pan: string; state: string; code: string; terms: string; isPublic: boolean;
  bankDetails: { accountName: string; accountNumber: string; ifsc: string; bankName: string; branch: string; upiId: string };
};

export type Service = BrandForm & {
  id: Id; slug: string; status: string; defaultTemplateId: Id | null;
  numbering: Partial<Record<Series, Partial<SeriesConfig>>> | null;
  logoKey: string | null; headerLogoKey: string | null; footerLogoKey: string | null; signatureKey: string | null;
};

export const emptyBrand = (): BrandForm => ({
  name: '', displayName: '', tagline: '', description: '', email: '', phone: '', website: '', address: '', gstin: '', pan: '', state: '',
  code: '', terms: '', isPublic: false,
  bankDetails: { accountName: '', accountNumber: '', ifsc: '', bankName: '', branch: '', upiId: '' },
});

export const brandBody = (v: BrandForm) => ({
  ...v,
  gstin: v.gstin.toUpperCase(),
  pan: v.pan.toUpperCase(),
  code: v.code.toUpperCase(),
});

const selectCls = 'select-chevron h-9 w-full appearance-none rounded-lg border border-border-input bg-surface pl-3 pr-8 text-sm shadow-xs hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-ring/60';

/** Brand profile fields, reused by the brand settings page and the onboarding wizard (`prefix` = "services.0."). */
export function BrandFields({ register, prefix = '', sections = ['profile', 'tax', 'invoicing', 'bank'] }: {
  // Registered under a runtime `prefix` in different forms; RHF's typed register can't express that.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>; prefix?: string; sections?: ('profile' | 'tax' | 'invoicing' | 'bank')[];
}) {
  const r = (n: string, opts?: object) => register(`${prefix}${n}`, opts);
  return (
    <div className="grid gap-6">
      {sections.includes('profile') && (
        <Section title="Profile">
          <Field label="Brand name *"><Input {...r('name', { required: true })} /></Field>
          <Field label="Display name" hint="Shown on invoices and the public page"><Input {...r('displayName')} /></Field>
          <Field label="Tagline" hint="Optional line under the brand name, e.g. “A unit of Acme Pvt Ltd”" className="sm:col-span-2"><Input maxLength={120} {...r('tagline')} /></Field>
          <Field label="Email"><Input type="email" {...r('email')} /></Field>
          <Field label="Phone"><Input {...r('phone')} /></Field>
          <Field label="Website"><Input placeholder="https://" {...r('website')} /></Field>
          <Field label="Address" className="sm:col-span-2"><Textarea {...r('address')} /></Field>
          <Field label="Description" className="sm:col-span-2"><Textarea {...r('description')} /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="size-4" {...r('isPublic')} /> Publish a public brand page (indexed by search engines)</label>
        </Section>
      )}
      {sections.includes('tax') && (
        <Section title="Tax">
          <Field label="GSTIN"><Input className="uppercase" maxLength={15} {...r('gstin')} /></Field>
          <Field label="PAN"><Input className="uppercase" maxLength={10} {...r('pan')} /></Field>
          <Field label="State" hint="Decides CGST + SGST or IGST on each invoice">
            <select className={selectCls} {...r('state')}>
              <option value="">Select state…</option>
              {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </Section>
      )}
      {sections.includes('invoicing') && (
        <Section title="Invoicing">
          <Field label="Brand code" hint="2–8 letters or digits used in document numbers; locked once documents are issued. Leave blank to generate.">
            <Input className="uppercase" maxLength={8} {...r('code', { pattern: /^[A-Za-z0-9]{2,8}$/ })} />
          </Field>
          <Field label="Default terms" className="sm:col-span-2"><Textarea {...r('terms')} /></Field>
        </Section>
      )}
      {sections.includes('bank') && (
        <Section title="Bank & UPI">
          <Field label="Account name"><Input {...r('bankDetails.accountName')} /></Field>
          <Field label="Account number"><Input {...r('bankDetails.accountNumber')} /></Field>
          <Field label="IFSC"><Input className="uppercase" {...r('bankDetails.ifsc')} /></Field>
          <Field label="Bank"><Input {...r('bankDetails.bankName')} /></Field>
          <Field label="Branch"><Input {...r('bankDetails.branch')} /></Field>
          <Field label="UPI ID" hint="Adds a UPI QR code to invoices"><Input {...r('bankDetails.upiId')} /></Field>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-4 sm:grid-cols-2">
      <legend className="mb-3 text-sm font-semibold text-fg-muted">{title}</legend>
      {children}
    </fieldset>
  );
}
