'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, CheckCircle2, ImagePlus, Pencil, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch, type FieldPath } from 'react-hook-form';
import { PasswordStrength } from '@/components/password-strength';
import { Alert, Button, Checkbox, Field, Input, Select, Textarea } from '@/components/ui';
import { ApiError, api, setAccessToken, tenant } from '@/lib/api';
import { INDIAN_STATES } from '@/lib/india';
import { codeFromName, formatNumber, SERIES, SERIES_LABELS } from '@/lib/numbering';
import { priceText } from '@/lib/plans';
import type { PublicPlan } from '@/lib/seo';
import { cn } from '@/lib/utils';
import { emptySignup, NUMBER_STYLES, numberingFor, signupSchema, toSignupPayload, type NumberStyle, type SignupValues } from './schema';
import type { Id } from '@/lib/ids';

const STEPS: { title: string; hint: string; fields: FieldPath<SignupValues>[] }[] = [
  { title: 'Account', hint: 'Your sign-in details', fields: ['account'] },
  { title: 'Company', hint: 'The legal entity you invoice as', fields: ['company'] },
  { title: 'Administrator', hint: 'Who manages this workspace', fields: ['admin'] },
  { title: 'First brand', hint: 'A service or brand you sell under', fields: ['service'] },
  { title: 'Branding', hint: 'Colours and logo for invoices', fields: ['theme'] },
  { title: 'Invoicing', hint: 'GST and document numbering', fields: ['invoicing'] },
  { title: 'Review', hint: 'Check everything and choose a plan', fields: ['planId', 'acceptTerms'] },
  { title: 'Done', hint: '', fields: [] },
];
const LAST = STEPS.length - 1;
const DRAFT_KEY = 'nv.signup.draft';
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const LOGO_MAX = 5 * 1024 * 1024;
const COLOR_PRESETS = [['#1e1b4b', '#4f46e5'], ['#0f172a', '#0ea5e9'], ['#052e16', '#16a34a'], ['#450a0a', '#dc2626'], ['#431407', '#ea580c'], ['#1f2937', '#a855f7']];

type Draft = { step: number; values: SignupValues };

export function SignupWizard({ plans, initialPlan }: { plans: PublicPlan[]; initialPlan?: string }) {
  const router = useRouter();
  const defaultPlan = String(plans.find((p) => String(p.id) === initialPlan)?.id ?? plans.find((p) => p.highlighted)?.id ?? plans[0]?.id ?? '');
  const form = useForm<SignupValues>({ resolver: zodResolver(signupSchema), defaultValues: emptySignup(defaultPlan), mode: 'onTouched' });
  const { register, trigger, getValues, setValue, setError, reset, control, formState: { errors, isDirty, isSubmitting } } = form;
  const [step, setStep] = useState(0);
  const [logo, setLogo] = useState<File | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const codeEdited = useRef(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as Draft;
      const base = emptySignup(defaultPlan);
      reset({ ...base, ...draft.values, account: { ...base.account, email: draft.values.account?.email ?? '' }, planId: draft.values.planId || defaultPlan }, { keepDefaultValues: true });
      setStep(Math.min(draft.step, LAST - 1));
      codeEdited.current = !!draft.values.service?.code;
      setRestored(true);
    } catch {
      sessionStorage.removeItem(DRAFT_KEY);
    }
  }, [defaultPlan, reset]);

  const values = useWatch({ control }) as SignupValues;
  useEffect(() => {
    if (step === LAST || !isDirty) return;
    const t = setTimeout(() => {
      const { password: _p, confirmPassword: _c, ...account } = values.account;
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step, values: { ...values, account } }));
    }, 400);
    return () => clearTimeout(t);
  }, [values, step, isDirty]);

  useEffect(() => {
    if (!isDirty || step === LAST) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty, step]);

  useEffect(() => { heading.current?.focus(); }, [step]);

  const logoUrl = useObjectUrl(logo);

  const go = (n: number) => { setSubmitError(null); setStep(n); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const next = async () => {
    if (!(await trigger(STEPS[step].fields, { shouldFocus: true }))) return;
    if (step === 0) {
      const ok = await checkEmail(getValues('account.email'));
      if (ok === false) return setError('account.email', { message: 'An account with this email already exists. Sign in instead.' }, { shouldFocus: true });
    }
    if (step === 1 && !getValues('invoicing.state') && getValues('company.state')) setValue('invoicing.state', getValues('company.state'));
    if (step === 4 && logoError) return;
    go(step + 1);
  };

  const submit = form.handleSubmit(async (v) => {
    setSubmitError(null);
    const body = new FormData();
    body.append('payload', JSON.stringify(toSignupPayload(v)));
    if (logo) body.append('logo', logo);
    try {
      const res = await api<{ accessToken: string; companyId: Id }>('/auth/signup', { form: body });
      setAccessToken(res.accessToken);
      tenant.setCompany(res.companyId);
      sessionStorage.removeItem(DRAFT_KEY);
      reset(v);
      go(LAST);
      setTimeout(() => router.replace('/app'), 2500);
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'EMAIL_TAKEN') { go(0); setError('account.email', { message: err.message }); return; }
      if (err.code === 'COMPANY_TAKEN' || err.code === 'COMPANY_NAME_INVALID') { go(1); setError('company.displayName', { message: err.message }); return; }
      setSubmitError(err.message);
    }
  }, (errs) => {
    const first = STEPS.findIndex((s) => s.fields.some((f) => f.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], errs)));
    if (first >= 0 && first !== step) go(first);
  });

  const pickLogo = (f: File | undefined) => {
    setLogoError(null);
    if (!f) return setLogo(null);
    if (!LOGO_TYPES.includes(f.type)) return setLogoError('Use a PNG, JPEG or WebP image.');
    if (f.size > LOGO_MAX) return setLogoError('The logo must be 5 MB or smaller.');
    setLogo(f);
  };

  const inv = values.invoicing ?? emptySignup().invoicing;
  const code = values.service?.code || 'CODE';
  const numbering = numberingFor(inv.style as NumberStyle, Number(inv.padding) || 6, Number(inv.start) || 1);
  const plan = plans.find((p) => String(p.id) === values.planId);

  if (step === LAST) {
    return (
      <div className="grid justify-items-center gap-4 py-8 text-center" role="status">
        <span className="grid size-16 place-items-center rounded-full bg-success-soft text-success"><CheckCircle2 className="size-8" aria-hidden /></span>
        <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">Your workspace is ready</h2>
        <p className="max-w-sm text-sm text-fg-muted">
          {getValues('company.displayName')} is set up with {getValues('service.name')} as its first brand
          {plan?.trialDays ? ` and a ${plan.trialDays}-day free trial of ${plan.name}` : ''}. Taking you to your dashboard…
        </p>
        <Button size="lg" onClick={() => router.replace('/app')}>Open my workspace</Button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (step === LAST - 1) void submit(); else void next(); }} noValidate className="grid gap-6">
      <Stepper step={step} onJump={(n) => n < step && go(n)} />

      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-primary">Step {step + 1} of {LAST}</p>
        <h2 ref={heading} tabIndex={-1} className="mt-1 text-lg font-semibold outline-none">{STEPS[step].title}</h2>
        <p className="text-sm text-fg-muted">{STEPS[step].hint}</p>
      </div>

      {restored && step > 0 && step < LAST - 1 && (
        <Alert tone="info" action={<Button type="button" variant="ghost" size="sm" onClick={() => { sessionStorage.removeItem(DRAFT_KEY); reset(emptySignup(defaultPlan)); setLogo(null); setRestored(false); go(0); }}>Start over</Button>}>
          We restored your progress. For security, enter your password again on the first step before finishing.
        </Alert>
      )}

      {step === 0 && (
        <div className="grid gap-4">
          <Field label="Work email" required error={errors.account?.email?.message}>
            <Input type="email" autoComplete="email" {...register('account.email', { onBlur: async (e) => {
              if (errors.account?.email || !e.target.value) return;
              if ((await checkEmail(e.target.value)) === false) setError('account.email', { message: 'An account with this email already exists. Sign in instead.' });
            } })} />
          </Field>
          <Field label="Password" required error={errors.account?.password?.message} hint="At least 8 characters with a letter and a number">
            <Input type="password" autoComplete="new-password" {...register('account.password')} />
          </Field>
          <PasswordStrength password={values.account?.password ?? ''} />
          <Field label="Confirm password" required error={errors.account?.confirmPassword?.message}>
            <Input type="password" autoComplete="new-password" {...register('account.confirmPassword')} />
          </Field>
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Registered company name" required error={errors.company?.legalName?.message} hint="As on your GST or incorporation certificate">
            <Input autoComplete="organization" {...register('company.legalName')} />
          </Field>
          <Field label="Short name" required error={errors.company?.displayName?.message} hint="Used for your workspace and web address">
            <Input {...register('company.displayName')} />
          </Field>
          <Field label="GSTIN" error={errors.company?.gstin?.message}><Input className="uppercase" maxLength={15} {...register('company.gstin')} /></Field>
          <Field label="PAN" error={errors.company?.pan?.message}><Input className="uppercase" maxLength={10} {...register('company.pan')} /></Field>
          <Field label="CIN / registration no." error={errors.company?.registrationNumber?.message}><Input {...register('company.registrationNumber')} /></Field>
          <Field label="Company email" error={errors.company?.email?.message}><Input type="email" {...register('company.email')} /></Field>
          <Field label="Phone" error={errors.company?.phone?.message}><Input type="tel" autoComplete="tel" {...register('company.phone')} /></Field>
          <Field label="Website" error={errors.company?.website?.message}><Input placeholder="https://" {...register('company.website')} /></Field>
          <Field label="Address" className="sm:col-span-2" error={errors.company?.address?.message}><Textarea rows={2} autoComplete="street-address" {...register('company.address')} /></Field>
          <Field label="City" error={errors.company?.city?.message}><Input autoComplete="address-level2" {...register('company.city')} /></Field>
          <Field label="State" error={errors.company?.state?.message}>
            <Select {...register('company.state')}><option value="">Select a state</option>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</Select>
          </Field>
          <Field label="PIN code" error={errors.company?.pincode?.message}><Input inputMode="numeric" maxLength={6} autoComplete="postal-code" {...register('company.pincode')} /></Field>
          <Field label="Country" error={errors.company?.country?.message}><Input autoComplete="country-name" {...register('company.country')} /></Field>
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-4">
          <p className="text-sm text-fg-muted">You’ll be the Company Admin for <strong className="text-fg">{values.company?.displayName || 'your company'}</strong>. You can invite more people once you’re in.</p>
          <Field label="Full name" required error={errors.admin?.fullName?.message}><Input autoComplete="name" {...register('admin.fullName')} /></Field>
          <Field label="Mobile number" error={errors.admin?.phone?.message}><Input type="tel" autoComplete="tel" {...register('admin.phone')} /></Field>
          <Field label="Sign-in email" hint="From step 1"><Input value={values.account?.email ?? ''} readOnly disabled /></Field>
        </div>
      )}

      {step === 3 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Brand or service name" required error={errors.service?.name?.message} hint="e.g. Lotus Solar Power">
            <Input {...register('service.name', { onChange: (e) => { if (!codeEdited.current) setValue('service.code', codeFromName(e.target.value)); } })} />
          </Field>
          <Field label="Brand code" required error={errors.service?.code?.message} hint={`Appears in document numbers, e.g. ${formatNumber(numbering.INVOICE, code, 1)}`}>
            <Input className="uppercase" maxLength={8} {...register('service.code', { onChange: () => { codeEdited.current = true; } })} />
          </Field>
          <Field label="Email" error={errors.service?.email?.message}><Input type="email" {...register('service.email')} /></Field>
          <Field label="Phone" error={errors.service?.phone?.message}><Input type="tel" {...register('service.phone')} /></Field>
          <Field label="Website" className="sm:col-span-2" error={errors.service?.website?.message}><Input placeholder="https://" {...register('service.website')} /></Field>
          <Field label="Address on invoices" className="sm:col-span-2" error={errors.service?.address?.message} hint="Leave empty to use the company address">
            <Textarea rows={2} {...register('service.address')} />
          </Field>
          <Field label="Short description" className="sm:col-span-2" error={errors.service?.description?.message}><Textarea rows={2} {...register('service.description')} /></Field>
        </div>
      )}

      {step === 4 && (
        <div className="grid gap-6">
          <fieldset className="grid gap-3">
            <legend className="mb-2 text-sm font-medium">Colour scheme</legend>
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map(([p, a]) => {
                const active = values.theme?.primaryColor === p && values.theme?.accentColor === a;
                return (
                  <button key={p + a} type="button" aria-label={`Use colours ${p} and ${a}`} aria-pressed={active}
                    onClick={() => { setValue('theme.primaryColor', p, { shouldDirty: true }); setValue('theme.accentColor', a, { shouldDirty: true }); }}
                    className={cn('flex h-10 w-16 overflow-hidden rounded-lg border-2 transition', active ? 'border-primary ring-2 ring-ring/50' : 'border-transparent hover:border-border-strong')}>
                    <span className="flex-1" style={{ background: p }} /><span className="flex-1" style={{ background: a }} />
                  </button>
                );
              })}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Primary colour" hint="Headings and totals"><Input type="color" className="h-10 p-1" {...register('theme.primaryColor')} /></Field>
              <Field label="Accent colour" hint="Table headers and highlights"><Input type="color" className="h-10 p-1" {...register('theme.accentColor')} /></Field>
            </div>
          </fieldset>
          <div className="grid gap-2">
            <span className="text-sm font-medium">Logo <span className="font-normal text-fg-muted">(optional)</span></span>
            <div className="flex flex-wrap items-center gap-4">
              <div className="grid size-20 place-items-center overflow-hidden rounded-xl border bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob: preview, next/image can't optimize it */}
                {logoUrl ? <img src={logoUrl} alt="Logo preview" className="size-full object-contain p-1" /> : <ImagePlus className="size-6 text-fg-subtle" aria-hidden />}
              </div>
              <label className="cursor-pointer rounded-lg border bg-surface px-3 py-2 text-sm font-medium shadow-sm hover:bg-surface-2 focus-within:ring-2 focus-within:ring-ring/60">
                {logo ? 'Change logo' : 'Upload logo'}
                <input type="file" accept={LOGO_TYPES.join(',')} className="sr-only" onChange={(e) => pickLogo(e.target.files?.[0])} />
              </label>
              {logo && <Button type="button" variant="ghost" size="sm" onClick={() => pickLogo(undefined)}><X className="size-4" aria-hidden />Remove</Button>}
            </div>
            <p className={cn('text-xs', logoError ? 'text-danger' : 'text-fg-muted')} role={logoError ? 'alert' : undefined}>{logoError ?? 'PNG, JPEG or WebP, up to 5 MB. You can change it later.'}</p>
          </div>
          <InvoicePreview values={values} logoUrl={logoUrl} number={formatNumber(numbering.INVOICE, code, Number(inv.start) || 1)} />
        </div>
      )}

      {step === 5 && (
        <div className="grid gap-6">
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-medium">GST</legend>
            <Checkbox className="sm:col-span-2" label="This brand is registered under GST" description="CGST + SGST or IGST is chosen per invoice from the customer’s state." {...register('invoicing.gstRegistered')} />
            {inv.gstRegistered && (
              <Field label="Brand GSTIN" required error={errors.invoicing?.gstin?.message} hint={values.company?.gstin ? 'Same as company? Copy it in.' : undefined}>
                <Input className="uppercase" maxLength={15} {...register('invoicing.gstin')} />
              </Field>
            )}
            <Field label="PAN" error={errors.invoicing?.pan?.message}><Input className="uppercase" maxLength={10} placeholder={values.company?.pan || ''} {...register('invoicing.pan')} /></Field>
            <Field label="State (place of supply)" required error={errors.invoicing?.state?.message}>
              <Select {...register('invoicing.state')}><option value="">Select a state</option>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</Select>
            </Field>
          </fieldset>
          <fieldset className="grid gap-4">
            <legend className="mb-2 text-sm font-medium">Document numbering</legend>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Numbering style">
              {(Object.keys(NUMBER_STYLES) as NumberStyle[]).map((k) => (
                <label key={k} className={cn('cursor-pointer rounded-xl border p-3 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/60', inv.style === k ? 'border-primary bg-primary-soft' : 'hover:border-border-strong')}>
                  <input type="radio" value={k} className="sr-only" {...register('invoicing.style')} />
                  <span className="block font-medium">{NUMBER_STYLES[k].label}</span>
                  <span className="block text-xs text-fg-muted">{NUMBER_STYLES[k].example}</span>
                  <span className="mt-2 block truncate font-mono text-xs">{formatNumber(numberingFor(k, Number(inv.padding) || 6, 1).INVOICE, code, 1)}</span>
                </label>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Digits in running number" error={errors.invoicing?.padding?.message}>
                <Select {...register('invoicing.padding')}>{[3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n} — {'0'.repeat(n - 1)}1</option>)}</Select>
              </Field>
              <Field label="First invoice number" error={errors.invoicing?.start?.message} hint="Continuing from another system? Start where you left off.">
                <Input type="number" inputMode="numeric" min={1} {...register('invoicing.start')} />
              </Field>
            </div>
            <div className="rounded-xl border bg-surface-2 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-fg-muted">Preview</p>
              <dl className="mt-2 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                {SERIES.map((s) => (
                  <div key={s} className="flex items-baseline justify-between gap-3">
                    <dt className="text-fg-muted">{SERIES_LABELS[s]}</dt>
                    <dd className="truncate font-mono text-xs">{formatNumber(numbering[s], code, s === 'INVOICE' ? Number(inv.start) || 1 : 1)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </fieldset>
          <Field label="Default terms on invoices" error={errors.invoicing?.terms?.message}><Textarea rows={3} placeholder="e.g. Payment due within 15 days." {...register('invoicing.terms')} /></Field>
        </div>
      )}

      {step === 6 && (
        <div className="grid gap-6">
          <dl className="grid gap-3">
            <Summary title="Account" onEdit={() => go(0)} rows={[['Email', values.account?.email]]} />
            <Summary title="Company" onEdit={() => go(1)} rows={[['Name', values.company?.legalName], ['GSTIN', values.company?.gstin], ['Location', [values.company?.city, values.company?.state].filter(Boolean).join(', ')]]} />
            <Summary title="Administrator" onEdit={() => go(2)} rows={[['Name', values.admin?.fullName], ['Mobile', values.admin?.phone]]} />
            <Summary title="First brand" onEdit={() => go(3)} rows={[['Name', values.service?.name], ['Code', values.service?.code], ['Logo', logo?.name ?? 'None']]} />
            <Summary title="Invoicing" onEdit={() => go(5)} rows={[['GST', inv.gstRegistered ? inv.gstin : 'Not registered'], ['State', inv.state], ['First invoice', formatNumber(numbering.INVOICE, code, Number(inv.start) || 1)]]} />
          </dl>
          {!values.account?.password && (
            <Alert tone="warning" action={<Button type="button" variant="secondary" size="sm" onClick={() => go(0)}>Enter password</Button>}>Enter your password again to finish.</Alert>
          )}
          <fieldset className="grid gap-3">
            <legend className="mb-2 text-sm font-medium">Plan</legend>
            {plans.length === 0 ? (
              <Alert tone="danger">We couldn’t load plans right now. Please refresh the page in a moment.</Alert>
            ) : (
              <div className="grid gap-2" role="radiogroup" aria-label="Plan">
                {plans.map((p) => (
                  <label key={p.id} className={cn('flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/60', values.planId === String(p.id) ? 'border-primary bg-primary-soft' : 'hover:border-border-strong')}>
                    <input type="radio" value={p.id} className="sr-only" {...register('planId')} />
                    <span>
                      <span className="font-medium">{p.name}</span>
                      {p.highlighted && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-fg">Popular</span>}
                      <span className="block text-xs text-fg-muted">{p.trialDays > 0 ? `${p.trialDays}-day free trial, then ` : ''}{priceText(p.price, p.currency)} / {p.interval === 'YEARLY' ? 'year' : 'month'}</span>
                    </span>
                    <span className={cn('grid size-5 shrink-0 place-items-center rounded-full border', values.planId === String(p.id) && 'border-primary bg-primary text-primary-fg')}>
                      {values.planId === String(p.id) && <Check className="size-3.5" aria-hidden />}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {errors.planId && <p role="alert" className="text-xs text-danger">{errors.planId.message}</p>}
          </fieldset>
          <div>
            <Checkbox label="I agree to the terms of service and privacy policy" {...register('acceptTerms')} />
            {errors.acceptTerms && <p role="alert" className="mt-1 text-xs text-danger">{errors.acceptTerms.message}</p>}
          </div>
          {submitError && <Alert tone="danger">{submitError}</Alert>}
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
        {step > 0 ? <Button type="button" variant="ghost" onClick={() => go(step - 1)}>Back</Button> : <span className="text-sm text-fg-muted">Already have an account? <Link href="/login" className="font-medium text-primary hover:underline">Sign in</Link></span>}
        <Button type="submit" size="lg" loading={isSubmitting} disabled={step === LAST - 1 && plans.length === 0}>
          {step === LAST - 1 ? 'Create my workspace' : 'Continue'}
        </Button>
      </div>
    </form>
  );
}

let lastCheck: { email: string; available: boolean } | null = null;

/** `undefined` when the check itself failed; the server re-checks on submit anyway. */
async function checkEmail(email: string): Promise<boolean | undefined> {
  const e = email.trim().toLowerCase();
  if (lastCheck?.email === e) return lastCheck.available;
  try {
    const r = await api<{ available: boolean }>('/auth/signup/check-email', { body: { email: e } });
    lastCheck = { email: e, available: r.available };
    return r.available;
  } catch {
    return undefined;
  }
}

function useObjectUrl(file: File | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return setUrl(null);
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}

function Stepper({ step, onJump }: { step: number; onJump: (n: number) => void }) {
  return (
    <nav aria-label="Signup progress">
      <div className="h-1.5 overflow-hidden rounded-full bg-muted sm:hidden">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((step + 1) / LAST) * 100}%` }} />
      </div>
      <ol className="hidden gap-1 sm:flex">
        {STEPS.slice(0, LAST).map((s, i) => (
          <li key={s.title} className="flex-1">
            <button type="button" onClick={() => onJump(i)} disabled={i >= step} aria-current={i === step ? 'step' : undefined}
              className={cn('group grid w-full gap-1.5 text-left text-xs', i < step && 'cursor-pointer')}>
              <span className={cn('h-1.5 rounded-full transition-colors', i <= step ? 'bg-primary' : 'bg-muted', i < step && 'group-hover:bg-primary-hover')} />
              <span className={cn('truncate', i === step ? 'font-medium text-fg' : 'text-fg-muted')}>{s.title}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Summary({ title, rows, onEdit }: { title: string; rows: [string, string | undefined][]; onEdit: () => void }) {
  return (
    <div className="rounded-xl border bg-surface p-4">
      <div className="flex items-center justify-between">
        <dt className="text-sm font-semibold">{title}</dt>
        <Button type="button" variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit ${title.toLowerCase()}`}><Pencil className="size-3.5" aria-hidden />Edit</Button>
      </div>
      <dd className="mt-1 grid gap-1 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4"><span className="text-fg-muted">{k}</span><span className="truncate text-right">{v || '—'}</span></div>
        ))}
      </dd>
    </div>
  );
}

function InvoicePreview({ values, logoUrl, number }: { values: SignupValues; logoUrl: string | null; number: string }) {
  const { primaryColor, accentColor } = values.theme ?? emptySignup().theme;
  return (
    <div aria-label="Invoice preview" role="img" className="overflow-hidden rounded-xl border bg-white p-5 text-[11px] text-slate-700 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob: preview, next/image can't optimize it */}
          {logoUrl && <img src={logoUrl} alt="" className="size-10 object-contain" />}
          <div>
            <p className="text-sm font-semibold" style={{ color: primaryColor }}>{values.service?.name || 'Your brand'}</p>
            <p>{values.company?.legalName || 'Your Company Pvt Ltd'}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold" style={{ color: primaryColor }}>TAX INVOICE</p>
          <p className="font-mono">{number}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto] rounded-md px-3 py-1.5 font-medium text-white" style={{ background: accentColor }}><span>Item</span><span>Amount</span></div>
      <div className="grid grid-cols-[1fr_auto] px-3 py-1.5"><span>Consulting services</span><span>₹ 50,000.00</span></div>
      <div className="mt-1 grid grid-cols-[1fr_auto] border-t px-3 pt-2 text-xs font-semibold" style={{ color: primaryColor }}><span>Total</span><span>₹ 59,000.00</span></div>
    </div>
  );
}
