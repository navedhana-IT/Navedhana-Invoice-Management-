'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { AuthShell } from '@/components/auth-shell';
import { PasswordStrength } from '@/components/password-strength';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api, setAccessToken } from '@/lib/api';
import { homeFor, type Me } from '@/lib/session';

const schema = z.object({
  password: z.string().regex(/^(?=.*[A-Za-z])(?=.*\d).{8,128}$/, 'Use at least 8 characters with a letter and a number'),
  confirm: z.string().min(1, 'Re-enter your new password'),
}).refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords don’t match' });

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, control, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const password = useWatch({ control, name: 'password' }) ?? '';

  const onSubmit = handleSubmit(async ({ password }) => {
    setError(null);
    try {
      const { accessToken } = await api<{ accessToken: string }>('/auth/reset-password', { body: { token, password } });
      setAccessToken(accessToken);
      router.replace(homeFor(await api<Me>('/me')));
    } catch (e) {
      setError((e as Error).message);
    }
  });

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="You’ll be signed out of every other device."
      footer={<Link href="/login" className="font-medium text-primary hover:underline">← Back to sign in</Link>}
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        {error && (
          <Alert tone="danger" action={<Link href="/forgot-password" className="font-medium underline">Request a new link</Link>}>{error}</Alert>
        )}
        <Field label="New password" error={formState.errors.password?.message} hint="At least 8 characters with a letter and a number">
          <Input type="password" autoComplete="new-password" autoFocus {...register('password')} />
        </Field>
        <PasswordStrength password={password} />
        <Field label="Confirm new password" error={formState.errors.confirm?.message}>
          <Input type="password" autoComplete="new-password" {...register('confirm')} />
        </Field>
        <Button type="submit" size="lg" loading={formState.isSubmitting}>Update password</Button>
      </form>
    </AuthShell>
  );
}
