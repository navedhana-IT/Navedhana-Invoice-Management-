'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button, Checkbox, Combobox, Field, Input, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { Role } from './types';
import { toId, type Id } from '@/lib/ids';

const schema = z.object({
  fullName: z.string().trim().min(2, 'Enter their full name').max(120),
  email: z.string().trim().min(1, 'Enter their email address').email('Enter a valid email address'),
  phone: z.union([z.literal(''), z.string().trim().regex(/^[+\d][\d\s-]{6,19}$/, 'Enter a valid phone number')]),
  roleIds: z.array(z.string()).min(1, 'Choose at least one role'),
  serviceIds: z.array(z.string()),
  departmentId: z.string(),
});
type Form = z.infer<typeof schema>;

export type InviteTarget = { id: Id; fullName: string; email?: string | null; phone?: string | null; serviceId?: Id | null; departmentId?: Id | null };

/** Sends a single-use invitation; with `employee`, the new login is linked to that staff record. */
export function InviteForm({ employee, onDone }: { employee?: InviteTarget; onDone: () => void }) {
  const qc = useQueryClient();
  const { ctx } = useSession();
  const roles = useQuery({ queryKey: ['/roles'], queryFn: () => api<Role[]>('/roles') });
  const { register, control, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: employee?.fullName ?? '', email: employee?.email ?? '', phone: employee?.phone ?? '',
      roleIds: [], serviceIds: employee?.serviceId ? [String(employee.serviceId)] : [], departmentId: employee?.departmentId ? String(employee.departmentId) : '',
    },
  });

  const send = useMutation({
    mutationFn: (v: Form) => api('/invitations', {
      body: {
        fullName: v.fullName, email: v.email, phone: v.phone || undefined, roleIds: v.roleIds.map(Number), serviceIds: v.serviceIds.map(Number),
        ...(employee ? { employeeId: employee.id } : { departmentId: toId(v.departmentId) }),
      },
    }),
    onSuccess: (_, v) => {
      toast.success(`Invitation sent to ${v.email}`);
      qc.invalidateQueries({ queryKey: ['/invitations'] });
      onDone();
    },
  });

  return (
    <form onSubmit={handleSubmit((v) => send.mutate(v))} noValidate className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required error={errors.fullName?.message}><Input autoComplete="off" {...register('fullName')} /></Field>
        <Field label="Email" required error={errors.email?.message}><Input type="email" autoComplete="off" {...register('email')} /></Field>
        <Field label="Phone" error={errors.phone?.message}><Input type="tel" {...register('phone')} /></Field>
        {!employee && (
          <Field label="Department" hint="Creates an employee record in this department">
            <Controller control={control} name="departmentId" render={({ field }) => (
              <Combobox path="/departments" value={toId(field.value) ?? null} onChange={(id) => field.onChange(id ? String(id) : '')} label={(d) => String(d.name)} placeholder="No department" clearable />
            )} />
          </Field>
        )}
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Roles <span className="text-danger" aria-hidden>*</span></legend>
        {roles.isPending ? <Skeleton className="h-16" /> : (
          <div className="grid gap-2 sm:grid-cols-2">
            {roles.data?.map((r) => (
              <Checkbox key={r.id} value={r.id} label={r.name} description={r.description ?? undefined}
                className="rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft" {...register('roleIds')} />
            ))}
          </div>
        )}
        {errors.roleIds && <p role="alert" className="mt-1 text-xs text-danger">{errors.roleIds.message}</p>}
      </fieldset>

      {!!ctx?.services.length && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Brand access</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {ctx.services.map((s) => (
              <Checkbox key={s.id} value={s.id} label={s.displayName ?? s.name} className="rounded-lg border px-3 py-2" {...register('serviceIds')} />
            ))}
          </div>
          <p className="mt-2 text-xs text-fg-muted">Roles that cover all brands, like Company Admin, see every brand regardless.</p>
        </fieldset>
      )}

      <p className="text-xs text-fg-muted">They’ll get an email with a link that works once and expires automatically. You can resend or cancel it from Members → Invitations.</p>
      <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={send.isPending}>Send invitation</Button>
      </div>
    </form>
  );
}
