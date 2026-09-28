'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { PageHeader } from '@/components/data';
import { Button, Card, CardHeader, Skeleton } from '@/components/ui';
import { CompanyFields, type CompanyForm } from '@/features/admin/company-fields';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { clean, titleCase } from '@/lib/utils';
import type { Id } from '@/lib/ids';

type Company = CompanyForm & { id: Id; slug: string; status: string; plan: { name: string; maxServices: number; maxUsers: number; features: string[] } | null };

export default function SettingsPage() {
  const { companyId } = useSession();
  const { data } = useQuery({ queryKey: ['/company', companyId], queryFn: () => api<Company>('/company', { noService: true }) });
  return data ? <Editor c={data} /> : <Skeleton className="h-96" />;
}

function Editor({ c }: { c: Company }) {
  const qc = useQueryClient();
  const { can } = useSession();
  const { register, handleSubmit, formState } = useForm<CompanyForm>({ defaultValues: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v ?? ''])) as CompanyForm });
  const save = useMutation({
    mutationFn: (v: CompanyForm) => {
      const { legalName, displayName, registrationNumber, gstin, pan, address, city, state, country, pincode, email, phone, website } = v;
      const body = clean({ legalName, displayName, registrationNumber, gstin: gstin.toUpperCase(), pan: pan.toUpperCase(), address, city, state, country, pincode, email, phone, website }, true);
      return api('/company', { method: 'PATCH', body, noService: true });
    },
    onSuccess: () => { toast.success('Company updated'); qc.invalidateQueries({ queryKey: ['/company'] }); qc.invalidateQueries({ queryKey: ['ctx'] }); },
  });
  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))}>
      <PageHeader title="Company settings" description={`Workspace slug: ${c.slug}`} actions={can('company.update') && <Button loading={save.isPending} disabled={!formState.isDirty}>Save changes</Button>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="p-5"><fieldset disabled={!can('company.update')}><CompanyFields register={register} /></fieldset></Card>
        {c.plan && (
          <Card className="h-fit">
            <CardHeader title={`${c.plan.name} plan`} description={`Up to ${c.plan.maxServices} brands · ${c.plan.maxUsers} users`} />
            <ul className="space-y-1.5 p-5 text-sm">{c.plan.features.map((f) => <li key={f}>✓ {titleCase(f)}</li>)}</ul>
            <p className="border-t p-5 text-xs text-fg-muted">Plan changes are handled by the platform team.</p>
          </Card>
        )}
      </div>
    </form>
  );
}
