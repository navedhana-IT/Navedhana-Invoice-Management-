'use client';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Eye, EyeOff, GripVertical, MoreHorizontal, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { PageHeader } from '@/components/data';
import { Badge, Button, Card, Checkbox, Dialog, DropdownMenu, Empty, Field, Input, MenuItem, MenuSeparator, QueryState, Select, Skeleton, Textarea, useConfirm } from '@/components/ui';
import { api } from '@/lib/api';
import { FEATURE_FLAGS, featureLabel, LIMIT_LABELS, limitText, priceText, storageText } from '@/lib/plans';
import { cn } from '@/lib/utils';
import type { Id } from '@/lib/ids';

type Plan = {
  id: Id; code: string; name: string; description: string | null; price: string; currency: string; interval: 'MONTHLY' | 'YEARLY';
  trialDays: number; features: string[]; limits: Record<string, number | boolean | null>; displayOrder: number; highlighted: boolean; isActive: boolean;
  _count: { companies: number };
};

const LIMIT_KEYS = [...LIMIT_LABELS.map(([k]) => k), 'storageMb'];
const limitField = z.string().trim().regex(/^\d*$/, 'Whole numbers only');

const schema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,29}$/, '2–30 capital letters, digits or _ (start with a letter)'),
  name: z.string().trim().min(2, 'Enter a plan name').max(60),
  description: z.string().trim().max(300),
  price: z.string().trim().regex(/^\d{1,12}(\.\d{1,2})?$/, 'Enter a price, e.g. 999 or 999.50'),
  currency: z.string().regex(/^[A-Z]{3}$/),
  interval: z.enum(['MONTHLY', 'YEARLY']),
  trialDays: z.coerce.number().int().min(0, '0 or more').max(365, 'At most 365 days'),
  features: z.string().max(2400),
  limits: z.record(limitField),
  flags: z.record(z.boolean()),
  highlighted: z.boolean(),
  isActive: z.boolean(),
});
type Form = z.input<typeof schema>;

const toForm = (p?: Plan): Form => ({
  code: p?.code ?? '', name: p?.name ?? '', description: p?.description ?? '', price: p ? String(Number(p.price)) : '', currency: p?.currency ?? 'INR',
  interval: p?.interval ?? 'MONTHLY', trialDays: p?.trialDays ?? 14, features: p?.features.join('\n') ?? '',
  limits: Object.fromEntries(LIMIT_KEYS.map((k) => [k, p?.limits[k] == null ? '' : String(p.limits[k])])),
  flags: Object.fromEntries(FEATURE_FLAGS.map(([k]) => [k, !!p?.limits[k]])),
  highlighted: p?.highlighted ?? false, isActive: p?.isActive ?? true,
});

export default function PlansPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const query = useQuery({ queryKey: ['admin-plans'], queryFn: () => api<Plan[]>('/admin/plans') });
  const [order, setOrder] = useState<Plan[]>([]);
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  useEffect(() => { if (query.data) setOrder(query.data); }, [query.data]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-plans'] });
  const reorder = useMutation({
    mutationFn: (ids: Id[]) => api<Plan[]>('/admin/plans/order', { method: 'PUT', body: { ids } }),
    onSuccess: (plans) => { qc.setQueryData(['admin-plans'], plans); toast.success('Plan order saved'); },
    onError: () => query.data && setOrder(query.data),
  });
  const toggle = useMutation({
    mutationFn: (p: Plan) => api(`/admin/plans/${p.id}/${p.isActive ? 'deactivate' : 'activate'}`, { method: 'POST' }),
    onSuccess: (_, p) => { toast.success(p.isActive ? `${p.name} hidden from new signups` : `${p.name} is available again`); refresh(); },
  });
  const highlight = useMutation({
    mutationFn: (p: Plan) => api(`/admin/plans/${p.id}`, { method: 'PATCH', body: { highlighted: !p.highlighted } }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (p: Plan) => api(`/admin/plans/${p.id}`, { method: 'DELETE' }),
    onSuccess: (_, p) => { toast.success(`${p.name} deleted`); refresh(); },
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const next = arrayMove(order, order.findIndex((p) => p.id === active.id), order.findIndex((p) => p.id === over.id));
    setOrder(next);
    reorder.mutate(next.map((p) => p.id));
  };

  const askDeactivate = async (p: Plan) => {
    if (!p.isActive || await confirm({ title: `Hide ${p.name}?`, description: `New companies won’t be able to choose it. The ${p._count.companies} companies already on it keep their limits.`, confirmLabel: 'Hide plan' })) toggle.mutate(p);
  };
  const askDelete = async (p: Plan) => {
    if (await confirm({ title: `Delete ${p.name}?`, description: 'The plan is removed permanently.', confirmLabel: 'Delete plan', tone: 'danger' })) remove.mutate(p);
  };

  return (
    <>
      <PageHeader title="Plans" description="What companies can choose at signup. Drag to change the order shown on the pricing page." actions={<Button onClick={() => setEditing('new')}><Plus className="size-4" /> New plan</Button>} />
      <QueryState query={query} loading={<div className="grid gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>}>
        {() => order.length === 0 ? (
          <Empty icon={<CreditCard className="size-5" />} title="No plans yet" description="Create a plan so companies can sign up." action={<Button onClick={() => setEditing('new')}><Plus className="size-4" /> New plan</Button>} />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={order.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              <ul className="grid grid-cols-1 gap-3" aria-label="Plans in display order">
                {order.map((p) => (
                  <PlanRow key={p.id} plan={p}>
                    <DropdownMenu label={`Actions for ${p.name}`} align="end" trigger={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${p.name}`}><MoreHorizontal className="size-4" /></Button>}>
                      <MenuItem icon={<Pencil className="size-4" />} onSelect={() => setEditing(p)}>Edit</MenuItem>
                      <MenuItem icon={<Star className="size-4" />} onSelect={() => highlight.mutate(p)}>{p.highlighted ? 'Remove highlight' : 'Highlight as popular'}</MenuItem>
                      <MenuItem icon={p.isActive ? <EyeOff className="size-4" /> : <Eye className="size-4" />} onSelect={() => askDeactivate(p)}>{p.isActive ? 'Hide from signups' : 'Make available'}</MenuItem>
                      {p._count.companies === 0 && <><MenuSeparator /><MenuItem danger icon={<Trash2 className="size-4" />} onSelect={() => askDelete(p)}>Delete</MenuItem></>}
                    </DropdownMenu>
                  </PlanRow>
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </QueryState>
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'New plan' : `Edit ${editing?.name ?? 'plan'}`} wide>
        {editing && <PlanForm plan={editing === 'new' ? undefined : editing} onDone={() => { setEditing(null); refresh(); }} onCancel={() => setEditing(null)} />}
      </Dialog>
    </>
  );
}

function PlanRow({ plan: p, children }: { plan: Plan; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && 'relative z-10')}>
      <Card className={cn('flex items-start gap-3 p-4 sm:items-center', isDragging && 'shadow-lg ring-2 ring-primary/40', !p.isActive && 'opacity-70')}>
        <button type="button" {...attributes} {...listeners} aria-label={`Reorder ${p.name}`} className="mt-1 cursor-grab touch-none rounded p-1 text-fg-subtle hover:bg-muted hover:text-fg active:cursor-grabbing sm:mt-0">
          <GripVertical className="size-4" />
        </button>
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_auto] sm:items-center sm:gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate font-semibold">{p.name}</h2>
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">{p.code}</span>
              {p.highlighted && <Badge value="ACTIVE" label="Popular" />}
              {!p.isActive && <Badge value="INACTIVE" label="Hidden" />}
            </div>
            <p className="mt-0.5 text-sm"><span className="font-semibold">{priceText(p.price, p.currency)}</span><span className="text-fg-muted"> / {p.interval === 'YEARLY' ? 'year' : 'month'}{p.trialDays ? ` · ${p.trialDays}-day trial` : ''}</span></p>
          </div>
          <p className="text-xs leading-relaxed text-fg-muted">
            {[...LIMIT_LABELS.slice(0, 3).map(([k, s, pl]) => limitText(p.limits, k, s, pl)), storageText(p.limits), ...FEATURE_FLAGS.filter(([k]) => p.limits[k]).map(([, l]) => l)].join(' · ')}
            {p.features.length > 0 && <span className="block truncate">{p.features.map(featureLabel).join(' · ')}</span>}
          </p>
          <p className="text-sm text-fg-muted sm:text-right">{p._count.companies} {p._count.companies === 1 ? 'company' : 'companies'}</p>
        </div>
        {children}
      </Card>
    </li>
  );
}

function PlanForm({ plan, onDone, onCancel }: { plan?: Plan; onDone: () => void; onCancel: () => void }) {
  const { register, handleSubmit, formState: { errors, isDirty } } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: toForm(plan) });
  const save = useMutation({
    mutationFn: (raw: Form) => {
      const v = schema.parse(raw);
      const limits = {
        ...Object.fromEntries(LIMIT_KEYS.map((k) => [k, v.limits[k] === '' ? null : Number(v.limits[k])])),
        ...v.flags,
      };
      const body = {
        code: v.code, name: v.name, description: v.description || undefined, price: v.price, currency: v.currency, interval: v.interval,
        trialDays: v.trialDays, features: v.features.split('\n').map((f) => f.trim()).filter(Boolean), limits, highlighted: v.highlighted, isActive: v.isActive,
      };
      return plan ? api(`/admin/plans/${plan.id}`, { method: 'PATCH', body }) : api('/admin/plans', { body });
    },
    onSuccess: () => { toast.success(plan ? 'Plan updated' : 'Plan created'); onDone(); },
  });

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required error={errors.name?.message}><Input {...register('name')} /></Field>
        <Field label="Code" required error={errors.code?.message} hint="Internal identifier, e.g. GROWTH"><Input className="uppercase" {...register('code')} /></Field>
        <Field label="Short description" className="sm:col-span-2" error={errors.description?.message}><Input {...register('description')} /></Field>
        <Field label="Price" required error={errors.price?.message}><Input inputMode="decimal" {...register('price')} /></Field>
        <Field label="Billing interval"><Select {...register('interval')}><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option></Select></Field>
        <Field label="Currency" error={errors.currency?.message}><Select {...register('currency')}><option value="INR">INR (₹)</option><option value="USD">USD ($)</option></Select></Field>
        <Field label="Free trial (days)" error={errors.trialDays?.message} hint="0 for no trial"><Input type="number" min={0} max={365} {...register('trialDays')} /></Field>
      </div>

      <fieldset>
        <legend className="mb-1 text-sm font-medium">Limits</legend>
        <p className="mb-3 text-xs text-fg-muted">Leave empty for unlimited.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {LIMIT_LABELS.map(([k, , plural]) => (
            <Field key={k} label={`Max ${plural}`} error={errors.limits?.[k]?.message}><Input inputMode="numeric" placeholder="Unlimited" {...register(`limits.${k}`)} /></Field>
          ))}
          <Field label="Storage (MB)" error={errors.limits?.storageMb?.message}><Input inputMode="numeric" placeholder="Unlimited" {...register('limits.storageMb')} /></Field>
        </div>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-medium">Included features</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {FEATURE_FLAGS.map(([k, label]) => <Checkbox key={k} label={label} className="rounded-lg border p-3" {...register(`flags.${k}`)} />)}
        </div>
        <Field label="Feature list on the pricing page" hint="One per line" error={errors.features?.message}><Textarea rows={4} {...register('features')} /></Field>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <Checkbox label="Highlight as popular" description="Shown with a badge on the pricing page" {...register('highlighted')} />
        <Checkbox label="Available for new signups" description="Hidden plans keep their existing companies" {...register('isActive')} />
      </div>

      <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={save.isPending} disabled={!!plan && !isDirty}>{plan ? 'Save changes' : 'Create plan'}</Button>
      </div>
    </form>
  );
}
