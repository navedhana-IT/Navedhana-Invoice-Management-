'use client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { PageHeader } from '@/components/data';
import { Button, Card, Field, Input } from '@/components/ui';
import { CompanyFields, emptyCompany, type CompanyForm } from '@/features/admin/company-fields';
import { BrandFields, brandBody, emptyBrand, type BrandForm } from '@/features/services/brand-fields';
import { api } from '@/lib/api';
import { clean, cn, money, titleCase } from '@/lib/utils';
import type { Id } from '@/lib/ids';

type Plan = { id: Id; code: string; name: string; priceMonthly: string; maxServices: number; maxUsers: number; features: string[] };
type Form = { company: CompanyForm & { planId: Id | '' }; admin: { fullName: string; email: string; password: string }; services: BrandForm[]; activate: boolean };

const STEPS = ['Company', 'Plan', 'Administrator', 'Brands', 'Tax & invoicing', 'Banking', 'Review'];
// Fields validated before leaving each step (the API validates everything again atomically).
const STEP_FIELDS: string[][] = [['company.legalName', 'company.displayName'], ['company.planId'], ['admin.fullName', 'admin.email', 'admin.password'], ['services'], [], [], []];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const plans = useQuery({ queryKey: ['admin-plans'], queryFn: () => api<Plan[]>('/admin/plans') });
  const { register, control, handleSubmit, trigger, setValue, getValues } = useForm<Form>({
    defaultValues: { company: { ...emptyCompany(), planId: '' }, admin: { fullName: '', email: '', password: '' }, services: [emptyBrand()], activate: true },
  });
  const services = useFieldArray({ control, name: 'services' });
  const [planId, brands] = useWatch({ control, name: ['company.planId', 'services'] });
  const plan = plans.data?.find((p) => p.id === planId);

  const submit = useMutation({
    mutationFn: (v: Form) => api<{ id: Id }>('/admin/onboarding', {
      body: { company: clean({ ...v.company, gstin: v.company.gstin.toUpperCase(), pan: v.company.pan.toUpperCase() }), admin: clean(v.admin), services: v.services.map((s) => clean(brandBody(s))), activate: v.activate },
    }),
    onSuccess: (c) => { toast.success('Company onboarded'); router.push(`/admin/companies/${c.id}`); },
  });

  const next = async () => {
    if (step === 3 && plan && brands.length > plan.maxServices) return toast.error(`${plan.name} allows up to ${plan.maxServices} brands`);
    if (await trigger(STEP_FIELDS[step] as never)) setStep(step + 1);
  };

  return (
    <form onSubmit={handleSubmit((v) => submit.mutate(v))}>
      <PageHeader title="Onboard a company" description="Creates the company, its administrator and brands in one atomic step." />
      <ol className="mb-6 grid grid-cols-7 gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className="text-center">
            <button type="button" disabled={i > step} onClick={() => setStep(i)} className={cn('mx-auto grid size-8 place-items-center rounded-full border text-xs font-semibold', i < step && 'border-primary bg-primary text-primary-fg', i === step && 'border-primary text-primary')}>
              {i < step ? <Check className="size-4" /> : i + 1}
            </button>
            <p className={cn('mt-1 hidden text-xs sm:block', i === step ? 'font-medium' : 'text-fg-muted')}>{s}</p>
          </li>
        ))}
      </ol>
      <Card className="p-6">
        <h2 className="mb-5 text-lg font-semibold">{STEPS[step]}</h2>
        {step === 0 && <CompanyFields register={register} prefix="company." />}
        {step === 1 && (
          <div className="grid gap-4 md:grid-cols-3">
            <input type="hidden" {...register('company.planId', { required: true })} />
            {plans.data?.map((p) => (
              <button type="button" key={p.id} onClick={() => setValue('company.planId', p.id, { shouldValidate: true })} className={cn('rounded-xl border p-5 text-left transition hover:border-primary', planId === p.id && 'border-primary ring-2 ring-primary/30')}>
                <p className="font-semibold">{p.name}</p>
                <p className="mt-1 text-2xl font-semibold">{money(p.priceMonthly)}<span className="text-sm font-normal text-fg-muted">/mo</span></p>
                <p className="mt-2 text-xs text-fg-muted">{p.maxServices} brands · {p.maxUsers} users</p>
                <ul className="mt-3 space-y-1 text-xs">{p.features.map((f) => <li key={f}>✓ {titleCase(f)}</li>)}</ul>
              </button>
            ))}
          </div>
        )}
        {step === 2 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name *"><Input {...register('admin.fullName', { required: true })} /></Field>
            <Field label="Email *"><Input type="email" {...register('admin.email', { required: true })} /></Field>
            <Field label="Initial password" hint="Min 8 characters. Leave empty if this user already has an account."><Input type="password" autoComplete="new-password" {...register('admin.password', { validate: (v) => !v || v.length >= 8 || 'At least 8 characters' })} /></Field>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-6">
            {services.fields.map((f, i) => (
              <div key={f.id} className="rounded-xl border p-5">
                <div className="mb-4 flex items-center justify-between"><p className="font-medium">Brand {i + 1}</p>{services.fields.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => services.remove(i)}><Trash2 className="size-4" /></Button>}</div>
                <BrandFields register={register} prefix={`services.${i}.`} sections={['profile']} />
              </div>
            ))}
            <Button type="button" variant="secondary" onClick={() => services.append(emptyBrand())}><Plus className="size-4" /> Add brand</Button>
          </div>
        )}
        {(step === 4 || step === 5) && (
          <div className="space-y-6">
            {services.fields.map((f, i) => (
              <div key={f.id} className="rounded-xl border p-5">
                <p className="mb-4 font-medium">{getValues(`services.${i}.name`) || `Brand ${i + 1}`}</p>
                <BrandFields register={register} prefix={`services.${i}.`} sections={step === 4 ? ['tax', 'invoicing'] : ['bank']} />
              </div>
            ))}
          </div>
        )}
        {step === 6 && <Review v={getValues()} plan={plan} register={register} />}
        <div className="mt-8 flex justify-between border-t pt-5">
          <Button type="button" variant="secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button>
          {/* Distinct keys: reusing one <button> and flipping its type mid-click submits the form early in WebKit. */}
          {step < STEPS.length - 1 ? <Button key="next" type="button" onClick={next}>Continue</Button> : <Button key="submit" type="submit" loading={submit.isPending}>Create company</Button>}
        </div>
      </Card>
    </form>
  );
}

function Review({ v, plan, register }: { v: Form; plan?: Plan; register: ReturnType<typeof useForm<Form>>['register'] }) {
  return (
    <div className="grid gap-6 text-sm md:grid-cols-3">
      <div><p className="font-medium">Company</p><p className="mt-1">{v.company.legalName}</p><p className="text-fg-muted">{v.company.gstin || 'No GSTIN'} · {plan?.name ?? 'No plan'}</p></div>
      <div><p className="font-medium">Administrator</p><p className="mt-1">{v.admin.fullName}</p><p className="text-fg-muted">{v.admin.email}</p></div>
      <div><p className="font-medium">Brands</p><ul className="mt-1 space-y-0.5">{v.services.map((s, i) => <li key={i}>{s.name} <span className="text-fg-muted">{s.code && `· ${s.code.toUpperCase()}`}</span></li>)}</ul></div>
      <label className="flex items-center gap-2 md:col-span-3"><input type="checkbox" className="size-4" {...register('activate')} /> Activate immediately (otherwise the company stays Pending)</label>
    </div>
  );
}
