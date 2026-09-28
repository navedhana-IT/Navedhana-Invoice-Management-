'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button, Checkbox, Dialog, Field, Input, Select, useConfirm } from '@/components/ui';
import { api } from '@/lib/api';
import { titleCase } from '@/lib/utils';
import type { Id } from '@/lib/ids';

type CustomField = { id: Id; key: string; label: string; type: string; options: string[]; required: boolean };
const TYPES = ['TEXT', 'NUMBER', 'DATE', 'DROPDOWN', 'BOOLEAN', 'CURRENCY'];

/** Per-brand custom invoice fields (shown in the invoice editor, rendered by the `custom_field` block). */
export function CustomFieldsPanel({ serviceId, editable }: { serviceId: Id; editable: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const confirm = useConfirm();
  const key = ['/custom-fields', serviceId];
  const { data } = useQuery({ queryKey: key, queryFn: () => api<CustomField[]>('/custom-fields', { query: { serviceId } }) });
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm({ defaultValues: { key: '', label: '', type: 'TEXT', options: '', required: false } });
  const create = useMutation({
    mutationFn: (v: { key: string; label: string; type: string; options: string; required: boolean }) =>
      api('/custom-fields', { body: { serviceId, key: v.key, label: v.label, type: v.type, required: v.required, options: v.type === 'DROPDOWN' ? v.options.split(',').map((o) => o.trim()).filter(Boolean) : undefined } }),
    onSuccess: () => { toast.success('Field added'); qc.invalidateQueries({ queryKey: key }); reset(); setOpen(false); },
  });
  const remove = useMutation({ mutationFn: (id: Id) => api(`/custom-fields/${id}`, { method: 'DELETE' }), onSuccess: () => { toast.success('Field deleted'); qc.invalidateQueries({ queryKey: key }); } });

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between px-1 pb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Custom fields</p>
        {editable && <button onClick={() => setOpen(true)} className="rounded p-0.5 text-fg-muted hover:bg-muted" aria-label="Add field"><Plus className="size-4" /></button>}
      </div>
      <ul className="space-y-1">
        {data?.map((f) => (
          <li key={f.id} className="group flex items-center justify-between rounded-lg px-2 py-1 text-sm hover:bg-muted">
            <span>{f.label} <span className="font-mono text-xs text-fg-muted">{f.key}</span></span>
            {editable && (
              <button type="button" aria-label={`Delete field ${f.label}`}
                onClick={async () => (await confirm({ title: `Delete “${f.label}”?`, description: 'Existing invoices keep the values they were saved with. The field disappears from new invoices.', confirmLabel: 'Delete field', tone: 'danger' })) && remove.mutate(f.id)}
                className="rounded p-0.5 text-fg-muted opacity-0 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"><Trash2 className="size-3.5" /></button>
            )}
          </li>
        ))}
        {!data?.length && <li className="px-2 text-xs text-fg-muted">None yet</li>}
      </ul>
      <Dialog open={open} onClose={() => setOpen(false)} title="New custom field">
        <form onSubmit={handleSubmit((v) => create.mutate(v))} className="grid gap-4" noValidate>
          <Field label="Label" required error={errors.label?.message}><Input {...register('label', { required: 'Give the field a label' })} placeholder="PO number" /></Field>
          <Field label="Key" required error={errors.key?.message} hint="Lowercase letters, numbers and underscores">
            <Input {...register('key', { required: 'A key is required', pattern: { value: /^[a-z][a-z0-9_]{1,39}$/, message: 'Start with a letter; use a–z, 0–9 and _ only' } })} placeholder="po_number" />
          </Field>
          <Field label="Type"><Select {...register('type')}>{TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</Select></Field>
          {watch('type') === 'DROPDOWN' && (
            <Field label="Options" required error={errors.options?.message} hint="Separate choices with commas">
              <Input {...register('options', { validate: (v) => v.split(',').some((o) => o.trim()) || 'Add at least one option' })} placeholder="Online, Walk-in, Referral" />
            </Field>
          )}
          <Checkbox label="Required on invoices" {...register('required')} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={create.isPending}>Add field</Button></div>
        </form>
      </Dialog>
    </div>
  );
}
