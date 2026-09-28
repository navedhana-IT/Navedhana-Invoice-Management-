'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button, Field, Input, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import type { Invoice } from './types';

type Form = { to: string; cc: string; message: string };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const split = (s: string) => s.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
const emails = (required: boolean) => (v: string) => {
  const list = split(v);
  if (!list.length) return !required || 'Enter at least one email address';
  if (list.length > 5) return 'Up to 5 addresses';
  return list.every((e) => EMAIL.test(e)) || 'Check the email addresses';
};

export function SendForm({ invoice, onDone }: { invoice: Invoice; onDone: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({ defaultValues: { to: invoice.customer?.email ?? '', cc: '', message: '' } });
  const send = useMutation({
    mutationFn: (v: Form) => api<{ to: string[] }>(`/invoices/${invoice.id}/send`, { body: { to: split(v.to), cc: split(v.cc), message: v.message || undefined } }),
    onSuccess: (r) => { toast.success(`Invoice emailed to ${r.to.join(', ')}`); qc.invalidateQueries({ queryKey: ['invoice', invoice.id] }); onDone(); },
  });
  return (
    <form onSubmit={handleSubmit((v) => send.mutate(v))} className="grid gap-4" noValidate>
      <Field label="To" required error={errors.to?.message} hint="Separate multiple addresses with commas">
        <Input type="text" inputMode="email" autoComplete="off" {...register('to', { validate: emails(true) })} />
      </Field>
      <Field label="CC" error={errors.cc?.message}><Input type="text" inputMode="email" autoComplete="off" {...register('cc', { validate: emails(false) })} /></Field>
      <Field label="Message" hint="Optional note shown above the invoice summary"><Textarea rows={4} maxLength={2000} {...register('message')} /></Field>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
        <Button loading={send.isPending}><Send className="size-4" /> Send email</Button>
      </div>
    </form>
  );
}
