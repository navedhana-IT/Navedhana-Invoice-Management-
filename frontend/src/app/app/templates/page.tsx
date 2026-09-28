'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, LayoutTemplate, MoreHorizontal, Plus, Star, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { PageHeader } from '@/components/data';
import { Badge, Button, Card, Dialog, DropdownMenu, Empty, Field, Input, MenuItem, Select, Skeleton, useConfirm } from '@/components/ui';
import type { Template } from '@/features/templates/types';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { date } from '@/lib/utils';
import { toId, type Id } from '@/lib/ids';

export default function TemplatesPage() {
  const { can, companyId, serviceId } = useSession();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['/invoice-templates', companyId, serviceId], queryFn: () => api<Template[]>('/invoice-templates') });
  return (
    <>
      <PageHeader title="Invoice templates" description="Design per-brand layouts. Publishing creates an immutable version; issued invoices keep the version they were issued with."
        actions={can('template.manage') && <Button onClick={() => setOpen(true)}><Plus className="size-4" /> New template</Button>} />
      {isLoading ? <Skeleton className="h-48" /> : !data?.length ? <Card><Empty icon={<LayoutTemplate className="size-5" />} title="No templates yet" /></Card> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((t) => {
            const latest = t.versions[0];
            const live = t.versions.find((v) => v.status === 'PUBLISHED');
            return (
              <Card key={t.id} className="relative h-full p-5 transition hover:border-primary hover:shadow-md">
                <div className="mb-4 grid h-28 place-items-center rounded-lg border bg-gradient-to-b from-muted to-surface"><LayoutTemplate className="size-8 text-fg-muted" /></div>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold">
                    <Link href={`/app/templates/${t.id}`} className="after:absolute after:inset-0 after:rounded-[inherit] focus-visible:outline-none">{t.name}</Link>
                  </h2>
                  {t.service.defaultTemplateId === t.id && <span className="inline-flex items-center gap-1 text-xs text-amber-600"><Star className="size-3 fill-current" /> Default</span>}
                </div>
                <p className="mt-1 text-sm text-fg-muted">{t.service.name} · v{latest?.version} {live ? `· live v${live.version}` : ''}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-fg-muted"><Badge value={latest?.status ?? 'DRAFT'} /><span>{date(latest?.createdAt)}</span></div>
                {can('template.manage') && <div className="absolute right-3 top-3 z-10"><TemplateMenu t={t} /></div>}
              </Card>
            );
          })}
        </div>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="New template">{open && <Create onDone={() => setOpen(false)} />}</Dialog>
    </>
  );
}

function TemplateMenu({ t }: { t: Template }) {
  const qc = useQueryClient();
  const router = useRouter();
  const confirm = useConfirm();
  const refresh = () => qc.invalidateQueries({ queryKey: ['/invoice-templates'] });
  const duplicate = useMutation({
    mutationFn: () => api<Template>(`/invoice-templates/${t.id}/duplicate`, { body: {} }),
    onSuccess: (copy) => { toast.success(`Created “${copy.name}”`); refresh(); router.push(`/app/templates/${copy.id}`); },
  });
  const remove = useMutation({
    mutationFn: () => api(`/invoice-templates/${t.id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Template deleted'); refresh(); },
  });
  const isDefault = t.service.defaultTemplateId === t.id;
  const askDelete = async () => {
    const ok = await confirm({
      title: `Delete “${t.name}”?`,
      description: 'It disappears from your templates and can’t be used for new invoices. Invoices already made with it keep their layout.',
      confirmLabel: 'Delete template', tone: 'danger',
    });
    if (ok) remove.mutate();
  };
  return (
    <DropdownMenu label={`Actions for ${t.name}`} align="end" trigger={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${t.name}`}><MoreHorizontal className="size-4" /></Button>}>
      <MenuItem icon={<Copy className="size-4" />} onSelect={() => duplicate.mutate()} disabled={duplicate.isPending}>Duplicate</MenuItem>
      <MenuItem danger icon={<Trash2 className="size-4" />} onSelect={askDelete} disabled={isDefault}>{isDefault ? 'Delete (make another default first)' : 'Delete'}</MenuItem>
    </DropdownMenu>
  );
}

function Create({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { ctx, serviceId } = useSession();
  const { register, handleSubmit } = useForm<{ name: string; serviceId: Id | '' }>({ defaultValues: { name: '', serviceId: serviceId ?? ctx?.services[0]?.id ?? '' } });
  const create = useMutation({
    mutationFn: (v: { name: string; serviceId: Id | '' }) => api<Template>('/invoice-templates', { body: v }),
    onSuccess: (t) => { qc.invalidateQueries({ queryKey: ['/invoice-templates'] }); onDone(); router.push(`/app/templates/${t.id}`); },
  });
  return (
    <form onSubmit={handleSubmit((v) => create.mutate(v))} className="grid gap-4">
      <Field label="Name *"><Input {...register('name', { required: true })} placeholder="e.g. Classic GST invoice" /></Field>
      <Field label="Brand"><Select {...register('serviceId', { setValueAs: (v) => toId(v) ?? '' })}>{ctx?.services.map((s) => <option key={s.id} value={s.id}>{s.displayName ?? s.name}</option>)}</Select></Field>
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onDone}>Cancel</Button><Button loading={create.isPending}>Create & open builder</Button></div>
    </form>
  );
}
