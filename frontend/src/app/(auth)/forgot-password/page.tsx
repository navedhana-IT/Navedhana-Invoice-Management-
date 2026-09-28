'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthShell } from '@/components/auth-shell';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api } from '@/lib/api';

const schema = z.object({ email: z.string().trim().min(1, 'Enter your email address').email('Enter a valid email address') });

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ email }) => {
    setError(null);
    try {
      await api('/auth/forgot-password', { body: { email } });
      setSentTo(email);
    } catch (e) {
      setError((e as Error).message);
    }
  });

  const back = <Link href="/login" className="font-medium text-primary hover:underline">← Back to sign in</Link>;

  if (sentTo) {
    return (
      <AuthShell title="Check your inbox" footer={back}>
        <div className="grid gap-4" role="status">
          <span className="grid size-12 place-items-center rounded-full bg-primary-soft text-primary"><MailCheck className="size-6" aria-hidden /></span>
          <p className="text-sm text-fg-muted">
            If an account exists for <strong className="text-fg">{sentTo}</strong>, we’ve sent a link to reset your password. It expires in an hour.
            Didn’t get it? Check your spam folder or <button type="button" className="font-medium text-primary hover:underline" onClick={() => setSentTo(null)}>try again</button>.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password" subtitle="Enter the email you sign in with and we’ll send you a reset link." footer={back}>
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Email" error={formState.errors.email?.message}>
          <Input type="email" autoComplete="email" autoFocus {...register('email')} />
        </Field>
        <Button type="submit" size="lg" loading={formState.isSubmitting}>Send reset link</Button>
      </form>
    </AuthShell>
  );
}
