'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { money, titleCase, today } from '@/lib/utils';
import { METHODS, type Invoice } from './types';

type Form = { amount: string; method: string; paidAt: string; reference: string; notes: string; scheduleItemId: string; status: 'SUCCESS' | 'FAILED' };

export function PaymentForm({ invoice, onDone }: { invoice: Invoice; onDone: () => void }) {
  const qc = useQueryClient();
  const open = invoice.schedule.filter((s) => s.status !== 'PAID');
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    defaultValues: { amount: invoice.balanceAmount, method: 'BANK_TRANSFER', paidAt: today(), reference: '', notes: '', scheduleItemId: '', status: 'SUCCESS' },
  });
  const save = useMutation({
    mutationFn: (body: object) => api(`/invoices/${invoice.id}/payments`, { body }),
    onSuccess: () => { toast.success('Payment recorded'); qc.invalidateQueries({ queryKey: ['invoice', invoice.id] }); qc.invalidateQueries({ queryKey: ['/invoices'] }); onDone(); },
  });

  return (
    <form
      onSubmit={handleSubmit((v) => save.mutate({ ...v, reference: v.reference || undefined, notes: v.notes || undefined, scheduleItemId: v.scheduleItemId || undefined }))}
      className="grid gap-4 sm:grid-cols-2"
    >
      <Field label="Amount (₹) *" hint={`Balance due ${money(invoice.balanceAmount)}`} error={errors.amount?.message}>
        <Input inputMode="decimal" {...register('amount', { required: 'Required', pattern: { value: /^\d+(\.\d{1,2})?$/, message: 'Up to 2 decimals' } })} />
      </Field>
      <Field label="Paid on *"><Input type="date" max={today()} {...register('paidAt', { required: true })} /></Field>
      <Field label="Method"><Select {...register('method')}>{METHODS.map((m) => <option key={m} value={m}>{titleCase(m)}</option>)}</Select></Field>
      <Field label="Reference" hint="UTR, cheque no., transaction id"><Input {...register('reference')} /></Field>
      <Field label="Apply to stage">
        <Select {...register('scheduleItemId')}>
          <option value="">Oldest due first</option>
          {open.map((s) => <option key={s.id} value={s.id}>Stage {s.stageNumber} · {s.description} · {money(Number(s.amount) - Number(s.paidAmount))} left</option>)}
        </Select>
      </Field>
      <Field label="Result">
        <Select {...register('status')}><option value="SUCCESS">Received</option><option value="FAILED">Failed attempt (no allocation)</option></Select>
      </Field>
      <Field label="Notes" className="sm:col-span-2"><Textarea {...register('notes')} /></Field>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={save.isPending}>Record payment</Button>
      </div>
    </form>
  );
}
