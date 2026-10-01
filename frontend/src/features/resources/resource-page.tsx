'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Inbox, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, type Control } from 'react-hook-form';
import { toast } from 'sonner';
import { DateRangeFilter, FilterSelect, ListCard, PageHeader, useList, type Column } from '@/components/data';
import { Button, Combobox, Dialog, Empty, Field, Input, Select, Textarea, useConfirm } from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { toId, type Id } from '@/lib/ids';
import { cn } from '@/lib/utils';

export type FieldDef = {
  /** `number` is sent as an integer; `decimal` stays a string so money never passes through floats. */
  name: string; label: string; type?: 'text' | 'email' | 'tel' | 'number' | 'decimal' | 'date' | 'textarea' | 'select' | 'service';
  required?: boolean; pattern?: [RegExp, string]; options?: { value: string; label: string }[]; optionsFrom?: { path: string; label: string };
  full?: boolean; hint?: string; upper?: boolean; colSpan?: string; rows?: number; placeholder?: string;
};

export type ResourceConfig<T> = {
  path: string; resource: string; title: string; singular: string; description: string;
  columns: Column<T>[]; fields: FieldDef[];
  filters?: { name: string; label: string; options: { value: string; label: string }[] }[];
  dateFilter?: boolean;
  search?: string;
  gridCols?: string;
};

type Row = { id: Id } & Record<string, unknown>;

/** Generic list + create/edit dialog for simple company master data. Validation is enforced again by the API. */
export function ResourcePage<T extends Row>({ cfg, actions }: { cfg: ResourceConfig<T>; actions?: React.ReactNode }) {
  const { can } = useSession();
  const list = useList<T>(`/${cfg.path}`, { filters: [...(cfg.filters?.map((f) => f.name) ?? []), ...(cfg.dateFilter ? ['from', 'to'] : [])] });
  const [editing, setEditing] = useState<T | 'new' | null>(null);
  const canCreate = can(`${cfg.resource}.create`);

  return (
    <>
      <PageHeader
        title={cfg.title}
        description={cfg.description}
        actions={(actions || canCreate) && <>{actions}{canCreate && <Button onClick={() => setEditing('new')}><Plus className="size-4" /> New {cfg.singular}</Button>}</>}
      />
      <ListCard
        list={list}
        columns={cfg.columns}
        searchPlaceholder={cfg.search}
        onRowClick={can(`${cfg.resource}.update`) ? setEditing : undefined}
        rowLabel={(r) => `Edit ${String(r.name ?? r.fullName ?? cfg.singular)}`}
        toolbar={(cfg.filters?.length || cfg.dateFilter) && (
          <>
            {cfg.filters?.map((f) => <FilterSelect key={f.name} list={list} name={f.name} label={f.label} options={f.options} />)}
            {cfg.dateFilter && <DateRangeFilter list={list} label="Added" />}
          </>
        )}
        empty={
          <Empty icon={<Inbox className="size-5" />} title={`No ${cfg.title.toLowerCase()} yet`} description={cfg.description}
            action={canCreate && <Button onClick={() => setEditing('new')}><Plus className="size-4" /> Add your first {cfg.singular}</Button>} />
        }
      />
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? `New ${cfg.singular}` : `Edit ${cfg.singular}`} wide>
        {editing && <ResourceForm cfg={cfg} record={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </>
  );
}

export function ResourceForm<T extends Row>({ cfg, record, onDone, onCreated }: { cfg: ResourceConfig<T>; record: T | null; onDone: () => void; onCreated?: (record: T) => void }) {
  const qc = useQueryClient();
  const { can } = useSession();
  const confirm = useConfirm();
  const defaults = Object.fromEntries(cfg.fields.map((f) => [f.name, toInput(record?.[f.name], f)]));
  const { register, control, handleSubmit, formState: { errors, isDirty } } = useForm<Record<string, string>>({ defaultValues: defaults });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => (record ? api<T>(`/${cfg.path}/${record.id}`, { method: 'PATCH', body }) : api<T>(`/${cfg.path}`, { body })),
    onSuccess: (saved) => {
      toast.success(record ? `${cap(cfg.singular)} updated` : `${cap(cfg.singular)} added`);
      qc.invalidateQueries({ queryKey: [`/${cfg.path}`] });
      if (!record && saved) {
        onCreated?.(saved);
      }
      onDone();
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/${cfg.path}/${record!.id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success(`${cap(cfg.singular)} deleted`); qc.invalidateQueries({ queryKey: [`/${cfg.path}`] }); onDone(); },
  });

  const onSubmit = handleSubmit((v) => {
    const body: Record<string, unknown> = {};
    for (const f of cfg.fields) {
      const raw = v[f.name]?.trim?.() ?? v[f.name];
      if (raw === '' || raw === undefined) { if (record && record[f.name] != null) body[f.name] = null; continue; }
      body[f.name] = f.type === 'number' || f.type === 'service' || f.optionsFrom ? Number(raw) : f.upper ? String(raw).toUpperCase() : raw;
    }
    save.mutate(body);
  });

  const askDelete = async () => {
    const name = String(record?.name ?? record?.fullName ?? `this ${cfg.singular}`);
    if (await confirm({ title: `Delete ${name}?`, description: `The ${cfg.singular} will be removed permanently. Records that reference it keep their history.`, confirmLabel: 'Delete', tone: 'danger' })) remove.mutate();
  };

  return (
    <form onSubmit={onSubmit} className={cn('grid gap-3 sm:grid-cols-2', cfg.gridCols)} noValidate>
      {cfg.fields.map((f) => (
        <Field
          key={f.name}
          label={f.label}
          required={f.required}
          error={errors[f.name]?.message}
          hint={f.hint}
          className={cn(
            f.colSpan ?? (f.full || f.type === 'textarea' ? (cfg.gridCols ? 'sm:col-span-full' : 'sm:col-span-2') : '')
          )}
        >
          {f.optionsFrom ? (
            <RemoteSelect f={f} control={control} selectedLabel={labelFor(record, f)} />
          ) : (
            <FieldInput f={f} reg={register(f.name, { required: f.required && `${f.label} is required`, pattern: f.pattern && { value: f.pattern[0], message: f.pattern[1] } })} />
          )}
        </Field>
      ))}
      <div className={cn('flex flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between', cfg.gridCols ? 'sm:col-span-full' : 'sm:col-span-2')}>
        {record && can(`${cfg.resource}.delete`) ? (
          <Button type="button" variant="danger-ghost" size="sm" loading={remove.isPending} onClick={askDelete}>
            <Trash2 className="size-4" /> Delete
          </Button>
        ) : <span />}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="secondary" size="sm" onClick={onDone}>Cancel</Button>
          <Button type="submit" size="sm" loading={save.isPending} disabled={!!record && !isDirty}>{record ? 'Save changes' : `Add ${cfg.singular}`}</Button>
        </div>
      </div>
    </form>
  );
}

function RemoteSelect({ f, control, selectedLabel, ...rest }: { f: FieldDef; control: Control<Record<string, string>>; selectedLabel?: string; id?: string }) {
  return (
    <Controller
      control={control}
      name={f.name}
      rules={{ required: f.required && `${f.label} is required` }}
      render={({ field, fieldState }) => (
        <Combobox
          {...rest}
          path={f.optionsFrom!.path}
          value={toId(field.value) ?? null}
          onChange={(id) => field.onChange(id ? String(id) : '')}
          label={(r) => String(r[f.optionsFrom!.label])}
          selectedLabel={selectedLabel}
          placeholder={`Choose ${f.label.toLowerCase()}…`}
          clearable={!f.required}
          invalid={!!fieldState.error}
        />
      )}
    />
  );
}

function FieldInput({ f, reg, ...rest }: { f: FieldDef; reg: ReturnType<ReturnType<typeof useForm>['register']> }) {
  const { ctx } = useSession();
  if (f.type === 'textarea') {
    return (
      <Textarea
        {...rest}
        rows={f.rows ?? 2}
        placeholder={f.placeholder}
        className={cn('min-h-[2.85rem] h-12 py-1.5 text-sm resize-none', f.rows && f.rows > 2 ? 'h-20 min-h-20' : '')}
        {...reg}
      />
    );
  }
  if (f.type === 'select' || f.type === 'service') {
    const options = f.type === 'service' ? (ctx?.services ?? []).map((s) => ({ value: String(s.id), label: s.displayName ?? s.name })) : f.options ?? [];
    return (
      <Select {...rest} className="h-9 text-sm" {...reg}>
        <option value="">{f.type === 'service' ? 'All brands (company-wide)' : '—'}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    );
  }
  const numeric = f.type === 'number' || f.type === 'decimal';
  return (
    <Input
      {...rest}
      type={numeric ? 'text' : f.type ?? 'text'}
      inputMode={f.type === 'number' ? 'numeric' : f.type === 'decimal' ? 'decimal' : undefined}
      autoComplete={f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : undefined}
      placeholder={f.placeholder}
      className="h-9 text-sm"
      {...reg}
    />
  );
}

function labelFor(record: Row | null, f: FieldDef) {
  const rel = record?.[f.name.replace(/Id$/, '')] as Record<string, unknown> | undefined;
  return rel ? String(rel[f.optionsFrom!.label] ?? '') : undefined;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function toInput(v: unknown, f: FieldDef) {
  if (v == null) return '';
  if (f.type === 'date') return String(v).slice(0, 10);
  return String(v);
}
