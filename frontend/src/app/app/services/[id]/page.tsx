'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, ImageUp, Star } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams, notFound } from 'next/navigation';
import { use } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { PageHeader } from '@/components/data';
import { Badge, Button, Card, CardHeader, Empty, Skeleton, TabPanel, Tabs } from '@/components/ui';
import { BrandFields, brandBody, emptyBrand, type BrandForm, type Service } from '@/features/services/brand-fields';
import { NumberingSettings } from '@/features/services/numbering-settings';
import type { Template } from '@/features/templates/types';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { clean } from '@/lib/utils';
import { toId, type Id } from '@/lib/ids';

const ASSETS = [
  { kind: 'LOGO', field: 'logoKey', label: 'Logo' },
  { kind: 'HEADER', field: 'headerLogoKey', label: 'Header logo' },
  { kind: 'FOOTER', field: 'footerLogoKey', label: 'Footer logo' },
  { kind: 'SIGNATURE', field: 'signatureKey', label: 'Signature' },
] as const;
const REQUIRED = ['name', 'code', 'isPublic'];
const TABS = [{ value: 'profile', label: 'Profile' }, { value: 'numbering', label: 'Numbering' }, { value: 'templates', label: 'Invoice template' }];

export default function ServicePage({ params }: { params: Promise<{ id: string }> }) {
  const id = toId(use(params).id);
  if (!id) notFound();
  const { data } = useQuery({ queryKey: ['service', id], queryFn: () => api<Service>(`/services/${id}`, { noService: true }) });
  return data ? <BrandSettings s={data} /> : <Skeleton className="h-96" />;
}

function BrandSettings({ s }: { s: Service }) {
  const { can, ctx } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const tab = useSearchParams().get('tab') ?? 'profile';
  return (
    <>
      <PageHeader
        back={<Link href="/app/services" className="mb-2 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"><ArrowLeft className="size-4" /> Brands</Link>}
        title={<span className="flex flex-wrap items-center gap-3">{s.displayName || s.name} <Badge value={s.status} /></span>}
        description={`Code ${s.code} · slug ${s.slug}`}
        actions={s.isPublic && ctx && <a href={`/b/${ctx.company.slug}/${s.slug}`} target="_blank" rel="noopener"><Button type="button" variant="secondary"><ExternalLink className="size-4" /> Public page</Button></a>}
      />
      <Tabs value={tab} onValueChange={(v) => router.replace(v === 'profile' ? pathname : `${pathname}?tab=${v}`, { scroll: false })} tabs={TABS}>
        <TabPanel value="profile"><Profile s={s} /></TabPanel>
        <TabPanel value="numbering"><NumberingSettings service={s} canEdit={can('service.update')} /></TabPanel>
        <TabPanel value="templates"><DefaultTemplate s={s} /></TabPanel>
      </Tabs>
    </>
  );
}

function Profile({ s }: { s: Service }) {
  const qc = useQueryClient();
  const { can } = useSession();
  const base = emptyBrand();
  const { register, handleSubmit, formState, reset } = useForm<BrandForm>({
    defaultValues: {
      ...Object.fromEntries(Object.keys(base).map((k) => [k, (s as unknown as Record<string, unknown>)[k] ?? (base as unknown as Record<string, unknown>)[k]])),
      bankDetails: { ...base.bankDetails, ...(s.bankDetails ?? {}) },
    } as BrandForm,
  });
  const update = useMutation({
    mutationFn: (body: object) => api<Service>(`/services/${s.id}`, { method: 'PATCH', body, noService: true }),
    onSuccess: (_, body) => {
      toast.success('Brand saved');
      if (!('logoKey' in body || 'headerLogoKey' in body || 'footerLogoKey' in body || 'signatureKey' in body)) reset(undefined, { keepValues: true });
      qc.invalidateQueries({ queryKey: ['service', s.id] }); qc.invalidateQueries({ queryKey: ['/services'] }); qc.invalidateQueries({ queryKey: ['ctx'] });
    },
  });
  const editable = can('service.update');

  const onSubmit = handleSubmit((v) => {
    const body = clean(brandBody(v), true) as Record<string, unknown>;
    for (const k of REQUIRED) if (body[k] === null) delete body[k];
    update.mutate(body);
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="p-5">
        <fieldset disabled={!editable} className="contents"><BrandFields register={register} /></fieldset>
        {editable && (
          <div className="mt-6 flex justify-end border-t pt-4">
            <Button loading={update.isPending} disabled={!formState.isDirty}>Save changes</Button>
          </div>
        )}
      </Card>
      <Card className="h-fit">
        <CardHeader title="Brand assets" description="PNG, JPEG or WebP · max 5 MB" />
        <div className="divide-y">
          {ASSETS.map((a) => <Asset key={a.kind} s={s} kind={a.kind} field={a.field} label={a.label} onSaved={(body) => update.mutate(body)} disabled={!editable} />)}
        </div>
      </Card>
    </form>
  );
}

function DefaultTemplate({ s }: { s: Service }) {
  const qc = useQueryClient();
  const { can } = useSession();
  const { data, isLoading } = useQuery({ queryKey: ['/invoice-templates', 'service', s.id], queryFn: () => api<Template[]>('/invoice-templates', { query: { serviceId: s.id }, noService: true }) });
  const setDefault = useMutation({
    mutationFn: (templateId: Id) => api(`/services/${s.id}/default-template`, { method: 'PUT', body: { templateId }, noService: true }),
    onSuccess: () => { toast.success('Default template updated'); qc.invalidateQueries({ queryKey: ['service', s.id] }); qc.invalidateQueries({ queryKey: ['/invoice-templates'] }); },
  });
  if (isLoading) return <Skeleton className="h-40" />;
  if (!data?.length) return <Card><Empty title="No templates for this brand" description="Create one in Invoice templates." action={<Link href="/app/templates" className="text-sm font-medium text-primary">Open templates</Link>} /></Card>;
  return (
    <Card>
      <CardHeader title="Default invoice template" description="New invoices for this brand use this template. Only published templates can be the default." />
      <ul className="divide-y">
        {data.map((t) => {
          const live = t.versions.find((v) => v.status === 'PUBLISHED');
          const isDefault = s.defaultTemplateId === t.id;
          return (
            <li key={t.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium">{t.name}{isDefault && <span className="inline-flex items-center gap-1 text-xs text-amber-600"><Star className="size-3 fill-current" /> Default</span>}</p>
                <p className="text-xs text-fg-muted">{live ? `Published v${live.version}` : 'Not published yet'}</p>
              </div>
              <Link href={`/app/templates/${t.id}`} className="text-sm text-fg-muted hover:text-fg">Open</Link>
              {!isDefault && can('template.publish') && (
                <Button type="button" variant="secondary" size="sm" disabled={!live} loading={setDefault.isPending && setDefault.variables === t.id} onClick={() => setDefault.mutate(t.id)}>Make default</Button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Asset({ s, kind, field, label, onSaved, disabled }: { s: Service; kind: string; field: keyof Service; label: string; onSaved: (b: object) => void; disabled: boolean }) {
  const key = s[field] as string | null;
  const preview = useQuery({ queryKey: ['sign', key], queryFn: () => api<{ url: string }>('/documents/sign', { body: { key }, noService: true }), enabled: !!key, staleTime: 240_000, retry: false });
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('kind', kind);
      form.append('serviceId', String(s.id));
      form.append('file', file);
      return api<{ storageKey: string }>('/documents/upload', { form, noService: true });
    },
    onSuccess: (doc) => onSaved({ [field]: doc.storageKey }),
  });
  return (
    <div className="flex items-center gap-4 p-4">
      <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg border bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
        {preview.data ? <img src={preview.data.url} alt={label} className="size-full object-contain" /> : <ImageUp className="size-5 text-slate-400" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="truncate text-xs text-fg-muted">{key ? 'Uploaded' : 'Not set'}</p>
      </div>
      <label className={disabled ? 'pointer-events-none opacity-50' : ''}>
        <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={disabled} onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} />
        <span className="inline-flex h-8 cursor-pointer items-center rounded-lg border px-3 text-xs font-medium hover:bg-muted">{upload.isPending ? 'Uploading…' : key ? 'Replace' : 'Upload'}</span>
      </label>
    </div>
  );
}
