'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { PageHeader } from '@/components/data';
import { PasswordStrength } from '@/components/password-strength';
import { Button, Card, CardHeader, Checkbox, Field, Input } from '@/components/ui';
import { api, setAccessToken } from '@/lib/api';
import { useSession, type Me } from '@/lib/session';
import { cn } from '@/lib/utils';

const profileSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(120),
  phone: z.union([z.literal(''), z.string().trim().regex(/^[+\d][\d\s-]{6,19}$/, 'Enter a valid phone number')]),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: z.string().regex(/^(?=.*[A-Za-z])(?=.*\d).{8,128}$/, 'Use at least 8 characters with a letter and a number'),
  confirm: z.string().min(1, 'Re-enter your new password'),
}).refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'Passwords don’t match' });

/** Profile, password, notification and theme preferences for the signed-in user (company and admin consoles). */
export function AccountSettings() {
  const { me } = useSession();
  return (
    <>
      <PageHeader title="Account settings" description={me.email} />
      <div className="grid max-w-3xl gap-6">
        <ProfileCard me={me} />
        <PasswordCard />
        <PreferencesCard me={me} />
      </div>
    </>
  );
}

function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body }: { body: Record<string, unknown>; msg: string }) => api<Me>('/me', { method: 'PATCH', body }),
    onSuccess: (me, { msg }) => { qc.setQueryData(['me'], me); toast.success(msg); },
  });
}

function ProfileCard({ me }: { me: Me }) {
  const update = useUpdateMe();
  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema), defaultValues: { fullName: me.fullName, phone: me.phone ?? '' },
  });
  return (
    <Card>
      <CardHeader title="Profile" />
      <form noValidate className="grid gap-4 px-5 pb-5 sm:grid-cols-2"
        onSubmit={handleSubmit((v) => update.mutate({ body: { fullName: v.fullName, phone: v.phone }, msg: 'Profile saved' }, { onSuccess: () => reset(v) }))}>
        <Field label="Full name" required error={errors.fullName?.message}><Input autoComplete="name" {...register('fullName')} /></Field>
        <Field label="Mobile number" error={errors.phone?.message}><Input type="tel" autoComplete="tel" {...register('phone')} /></Field>
        <Field label="Email" hint="Contact support to change your sign-in email" className="sm:col-span-2"><Input value={me.email} readOnly disabled /></Field>
        <div className="flex justify-end sm:col-span-2"><Button type="submit" loading={update.isPending} disabled={!isDirty}>Save profile</Button></div>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const { register, handleSubmit, reset, control, setError, formState: { errors, isSubmitting } } = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema) });
  const next = useWatch({ control, name: 'newPassword' }) ?? '';
  const onSubmit = handleSubmit(async (v) => {
    try {
      const { accessToken } = await api<{ accessToken: string }>('/auth/change-password', { body: { currentPassword: v.currentPassword, newPassword: v.newPassword } });
      setAccessToken(accessToken);
      reset({ currentPassword: '', newPassword: '', confirm: '' });
      toast.success('Password changed. Other devices have been signed out.');
    } catch (e) {
      const err = e as { code?: string; message: string };
      if (err.code === 'WRONG_PASSWORD') setError('currentPassword', { message: err.message });
      else setError('newPassword', { message: err.message });
    }
  });
  return (
    <Card>
      <CardHeader title="Password" />
      <form noValidate onSubmit={onSubmit} className="grid gap-4 px-5 pb-5 sm:max-w-sm">
        <Field label="Current password" error={errors.currentPassword?.message}><Input type="password" autoComplete="current-password" {...register('currentPassword')} /></Field>
        <Field label="New password" error={errors.newPassword?.message} hint="At least 8 characters with a letter and a number"><Input type="password" autoComplete="new-password" {...register('newPassword')} /></Field>
        <PasswordStrength password={next} />
        <Field label="Confirm new password" error={errors.confirm?.message}><Input type="password" autoComplete="new-password" {...register('confirm')} /></Field>
        <div><Button type="submit" loading={isSubmitting}>Change password</Button></div>
      </form>
    </Card>
  );
}

function PreferencesCard({ me }: { me: Me }) {
  const update = useUpdateMe();
  const { theme, setTheme } = useTheme();
  return (
    <Card>
      <CardHeader title="Preferences" />
      <div className="grid gap-5 px-5 pb-5">
        <Checkbox
          label="Email me about activity"
          description="Payment received and overdue invoice summaries. Invitations and security emails are always sent."
          checked={me.emailNotifications}
          disabled={update.isPending}
          onChange={(e) => update.mutate({ body: { emailNotifications: e.target.checked }, msg: e.target.checked ? 'Activity emails turned on' : 'Activity emails turned off' })}
        />
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Theme</legend>
          <div className="grid max-w-sm grid-cols-2 gap-2" role="radiogroup" aria-label="Theme">
            {([['light', 'Light', Sun], ['dark', 'Dark', Moon]] as const).map(([value, label, Icon]) => (
              <button key={value} type="button" role="radio" aria-checked={theme === value} onClick={() => setTheme(value)}
                className={cn('flex items-center gap-2 rounded-xl border p-3 text-sm font-medium transition', theme === value ? 'border-primary bg-primary-soft text-primary' : 'hover:border-border-strong')}>
                <Icon className="size-4" aria-hidden />{label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </Card>
  );
}
