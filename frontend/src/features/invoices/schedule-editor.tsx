'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { Button, Input, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { money } from '@/lib/utils';
import type { Invoice } from './types';

type Row = { description: string; amount: string; dueType: 'FIXED' | 'OPTIONAL' | 'NONE'; dueDate: string };

const MONEY = /^\d{1,16}(\.\d{1,2})?$/;

/** Stages must add up to the invoice total; the server re-validates and rejects mismatches. */
export function ScheduleEditor({ invoice, onDone }: { invoice: Invoice; onDone: () => void }) {
  const qc = useQueryClient();
  const { register, control, handleSubmit, formState: { errors } } = useForm<{ rows: Row[] }>({
    defaultValues: {
      rows: invoice.schedule.length
        ? invoice.schedule.map((s) => ({ description: s.description ?? '', amount: s.amount, dueType: s.dueType, dueDate: s.dueDate?.slice(0, 10) ?? '' }))
        : [{ description: 'Full payment', amount: invoice.total, dueType: 'FIXED', dueDate: invoice.dueDate?.slice(0, 10) ?? '' }],
    },
  });
  const rows = useFieldArray({ control, name: 'rows' });
  const watched = useWatch({ control, name: 'rows' });
  const remaining = Math.round(Number(invoice.total) * 100 - watched.reduce((s, r) => s + Math.round(Number(r.amount || 0) * 100), 0)) / 100;

  const save = useMutation({
    mutationFn: (items: object[]) => api(`/invoices/${invoice.id}/payment-schedule`, { method: 'PUT', body: { items } }),
    onSuccess: () => { toast.success('Schedule saved'); qc.invalidateQueries({ queryKey: ['invoice', invoice.id] }); onDone(); },
  });

  const rowErrors = (errors.rows ?? []) as { amount?: { message?: string }; dueDate?: { message?: string } }[];
  const messages = [...new Set(rowErrors.flatMap((e, i) => [e?.amount && `Stage ${i + 1}: ${e.amount.message}`, e?.dueDate && `Stage ${i + 1}: ${e.dueDate.message}`]).filter(Boolean))];

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v.rows.map((r) => ({ ...r, description: r.description || undefined, dueDate: r.dueType === 'NONE' ? undefined : r.dueDate || undefined }))))} className="space-y-3" noValidate>
      {rows.fields.map((f, i) => (
        <div key={f.id} className="grid grid-cols-12 gap-2">
          <Input className="col-span-12 sm:col-span-4" placeholder={`Stage ${i + 1}`} aria-label={`Stage ${i + 1} description`} {...register(`rows.${i}.description`)} />
          <Input className="col-span-5 sm:col-span-3" inputMode="decimal" placeholder="Amount" aria-label={`Stage ${i + 1} amount`} aria-invalid={!!rowErrors[i]?.amount || undefined}
            {...register(`rows.${i}.amount`, {
              required: 'Enter an amount',
              pattern: { value: MONEY, message: 'Use a number with up to 2 decimals' },
              validate: (v) => Number(v) > 0 || 'Amount must be more than 0',
            })} />
          <Select className="col-span-7 sm:col-span-2" aria-label={`Stage ${i + 1} due type`} {...register(`rows.${i}.dueType`)}>
            <option value="FIXED">Fixed</option><option value="OPTIONAL">Optional</option><option value="NONE">No date</option>
          </Select>
          <Input className="col-span-10 sm:col-span-2" type="date" aria-label={`Stage ${i + 1} due date`} disabled={watched[i]?.dueType === 'NONE'} aria-invalid={!!rowErrors[i]?.dueDate || undefined}
            {...register(`rows.${i}.dueDate`, { validate: (v, all) => all.rows[i]?.dueType !== 'FIXED' || !!v || 'Fixed stages need a due date' })} />
          <Button type="button" variant="ghost" size="sm" className="col-span-2 sm:col-span-1" onClick={() => rows.remove(i)} disabled={rows.fields.length === 1} aria-label={`Remove stage ${i + 1}`}><Trash2 className="size-4" /></Button>
        </div>
      ))}
      {messages.length > 0 && <ul className="space-y-0.5 text-sm text-danger" role="alert">{messages.map((m) => <li key={m}>{m}</li>)}</ul>}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-sm">
        <Button type="button" variant="secondary" size="sm" onClick={() => rows.append({ description: '', amount: remaining > 0 ? remaining.toFixed(2) : '', dueType: 'OPTIONAL', dueDate: '' })}>
          <Plus className="size-4" /> Add stage
        </Button>
        <span className={remaining === 0 ? 'text-emerald-600' : 'text-amber-600'} aria-live="polite">
          {remaining === 0 ? 'Stages match the invoice total' : remaining > 0 ? <>Still to allocate: <b className="num">{money(remaining)}</b></> : <>Over the total by <b className="num">{money(-remaining)}</b></>}
        </span>
      </div>
      <p className="text-xs text-fg-muted">Only <b>fixed</b> due dates can make a stage overdue. Optional dates are reminders.</p>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={save.isPending} disabled={remaining !== 0}>Save schedule</Button>
      </div>
    </form>
  );
}
