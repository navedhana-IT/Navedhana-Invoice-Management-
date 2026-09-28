'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Power } from 'lucide-react';
import Link from 'next/link';
import { useRouter, notFound } from 'next/navigation';
import { use, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { PageHeader } from '@/components/data';
import { Badge, Button, Card, CardHeader, Field, Input, Select, Skeleton, useConfirm } from '@/components/ui';
import { CompanyFields, type CompanyForm } from '@/features/admin/company-fields';
import { api, tenant } from '@/lib/api';
import { clean, date } from '@/lib/utils';
import { toId, type Id } from '@/lib/ids';

type Company = CompanyForm & {
  id: Id; slug: string; status: string; planId: Id | null; plan: { name: string } | null;
  subscriptionStatus: 'TRIALING' | 'ACTIVE' | 'EXPIRED'; trialEndsAt: string | null;
  services: { id: Id; name: string; displayName: string | null; status: string; code: string }[];
  memberships: { id: Id; status: string; user: { email: string; fullName: string }; roles: { role: { name: string } }[] }[];
};
type Plan = { id: Id; name: string; isActive: boolean };

export default function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const id = toId(use(params).id);
  if (!id) notFound();
  const { data } = useQuery({ queryKey: ['admin-company', id], queryFn: () => api<Company>(`/admin/companies/${id}`) });
  return data ? <Detail c={data} /> : <Skeleton className="h-96" />;
}

function Detail({ c }: { c: Company }) {
  const qc = useQueryClient();
  const router = useRouter();
  const confirm = useConfirm();
  const { register, handleSubmit, formState } = useForm<CompanyForm>({ defaultValues: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v ?? ''])) as never });
  const done = (msg: string) => { toast.success(msg); qc.invalidateQueries({ queryKey: ['admin-company', c.id] }); qc.invalidateQueries({ queryKey: ['/admin/companies'] }); };
  const save = useMutation({
    mutationFn: (v: CompanyForm) => {
      const { legalName, displayName, registrationNumber, gstin, pan, address, city, state, country, pincode, email, phone, website } = v;
      return api(`/admin/companies/${c.id}`, { method: 'PATCH', body: clean({ legalName, displayName, registrationNumber, gstin: gstin.toUpperCase(), pan: pan.toUpperCase(), address, city, state, country, pincode, email, phone, website }, true) });
    },
    onSuccess: () => done('Company saved'),
  });
  const toggle = useMutation({
    mutationFn: () => api(`/admin/companies/${c.id}/${c.status === 'ACTIVE' ? 'deactivate' : 'activate'}`, { method: 'POST' }),
    onSuccess: () => done(c.status === 'ACTIVE' ? 'Company deactivated' : 'Company activated'),
  });
  const openWorkspace = () => { tenant.setCompany(c.id); qc.clear(); router.push('/app'); };

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))}>
      <PageHeader
        back={<Link href="/admin/companies" className="mb-2 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"><ArrowLeft className="size-4" /> Companies</Link>}
        title={<span className="flex items-center gap-3">{c.displayName} <Badge value={c.status} /></span>}
        description={c.legalName}
        actions={
          <>
            {c.status === 'ACTIVE' && <Button type="button" variant="secondary" onClick={openWorkspace}><ExternalLink className="size-4" /> Open workspace</Button>}
            <Button type="button" variant={c.status === 'ACTIVE' ? 'danger' : 'secondary'} loading={toggle.isPending}
              onClick={async () => (await confirm(c.status === 'ACTIVE'
                ? { title: `Deactivate ${c.displayName}?`, description: 'Members lose access to the workspace immediately. Data is kept and the company can be reactivated later.', confirmLabel: 'Deactivate', tone: 'danger' }
                : { title: `Activate ${c.displayName}?`, description: 'Members regain access and the company admin is notified.', confirmLabel: 'Activate' })) && toggle.mutate()}>
              <Power className="size-4" /> {c.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
            </Button>
            <Button loading={save.isPending} disabled={!formState.isDirty}>Save</Button>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="p-5">
          <CompanyFields register={register} />
        </Card>
        <div className="space-y-6">
          <SubscriptionCard c={c} onChanged={done} />
          <Card>
            <CardHeader title={`Brands (${c.services.length})`} />
            <ul className="divide-y text-sm">{c.services.map((s) => <li key={s.id} className="flex justify-between px-5 py-2.5"><span>{s.displayName ?? s.name} <span className="text-fg-muted">· {s.code}</span></span><Badge value={s.status} /></li>)}</ul>
          </Card>
          <Card>
            <CardHeader title={`Members (${c.memberships.length})`} />
            <ul className="divide-y text-sm">{c.memberships.map((m) => <li key={m.id} className="px-5 py-2.5"><p className="font-medium">{m.user.fullName}</p><p className="text-xs text-fg-muted">{m.user.email} · {m.roles.map((r) => r.role.name).join(', ')}</p></li>)}</ul>
          </Card>
        </div>
      </div>
    </form>
  );
}

function SubscriptionCard({ c, onChanged }: { c: Company; onChanged: (msg: string) => void }) {
  const confirm = useConfirm();
  const plans = useQuery({ queryKey: ['admin-plans'], queryFn: () => api<Plan[]>('/admin/plans') });
  const [trialEnd, setTrialEnd] = useState(() => (c.trialEndsAt ?? new Date(Date.now() + 14 * 86_400_000).toISOString()).slice(0, 10));
  const update = useMutation({
    mutationFn: ({ body }: { body: Record<string, unknown>; msg: string }) => api(`/admin/companies/${c.id}/subscription`, { method: 'PATCH', body }),
    onSuccess: (_, { msg }) => onChanged(msg),
  });
  const trialDate = new Date(`${trialEnd}T23:59:59`);
  const daysLeft = c.trialEndsAt ? Math.ceil((new Date(c.trialEndsAt).getTime() - Date.now()) / 86_400_000) : null;

  return (
    <Card>
      <CardHeader title="Subscription" />
      <div className="grid gap-4 px-5 pb-5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-fg-muted">Status</span>
          <Badge value={c.subscriptionStatus} label={c.subscriptionStatus === 'ACTIVE' ? 'Paid' : c.subscriptionStatus === 'TRIALING' ? 'Trial' : 'Expired'} />
        </div>
        {c.subscriptionStatus === 'TRIALING' && c.trialEndsAt && (
          <p className="text-fg-muted">Trial ends {date(c.trialEndsAt)}{daysLeft !== null && daysLeft >= 0 ? ` (${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left)` : ''}</p>
        )}
        <Field label="Plan">
          <Select value={c.planId ?? ''} disabled={update.isPending} onChange={(e) => e.target.value && update.mutate({ body: { planId: Number(e.target.value) }, msg: 'Plan changed' })}>
            {!c.planId && <option value="">No plan</option>}
            {plans.data?.filter((p) => p.isActive || p.id === c.planId).map((p) => <option key={p.id} value={p.id}>{p.name}{p.isActive ? '' : ' (hidden)'}</option>)}
          </Select>
        </Field>
        <div className="grid gap-2">
          <Field label="Trial end date">
            <Input type="date" value={trialEnd} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setTrialEnd(e.target.value)} />
          </Field>
          <Button type="button" variant="secondary" size="sm" loading={update.isPending} disabled={!trialEnd}
            onClick={() => update.mutate({ body: { subscriptionStatus: 'TRIALING', trialEndsAt: trialDate.toISOString() }, msg: `Trial runs until ${date(trialDate.toISOString())}` })}>
            {c.subscriptionStatus === 'TRIALING' ? 'Update trial' : 'Start trial'}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 border-t pt-4">
          {c.subscriptionStatus !== 'ACTIVE' && (
            <Button type="button" size="sm" onClick={async () => (await confirm({ title: `Mark ${c.displayName} as paid?`, description: 'The trial ends and the company keeps full access on its plan.', confirmLabel: 'Mark as paid' })) && update.mutate({ body: { subscriptionStatus: 'ACTIVE' }, msg: 'Subscription marked as paid' })}>
              Mark as paid
            </Button>
          )}
          {c.subscriptionStatus !== 'EXPIRED' && (
            <Button type="button" size="sm" variant="danger-ghost" onClick={async () => (await confirm({ title: `Expire ${c.displayName}’s subscription?`, description: 'Members can still sign in and view data, but can’t create or change anything until a plan is active.', confirmLabel: 'Expire now', tone: 'danger' })) && update.mutate({ body: { subscriptionStatus: 'EXPIRED' }, msg: 'Subscription expired' })}>
              Expire now
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
