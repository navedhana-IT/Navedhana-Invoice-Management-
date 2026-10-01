'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthShell } from '@/components/auth-shell';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api, login } from '@/lib/api';
import { homeFor, type Me } from '@/lib/session';

const schema = z.object({ email: z.string().trim().email('Enter a valid email address'), password: z.string().min(1, 'Enter your password') });

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get('next');
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      await login(v.email, v.password);
      const me = await api<Me>('/me');
      const safeNext = next?.startsWith('/') && !next.startsWith('//') ? next : null;
      router.replace(safeNext ?? homeFor(me));
    } catch (e) {
      setError((e as Error).message);
    }
  });

  return (
    <form method="post" onSubmit={onSubmit} className="grid gap-4" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Email" error={formState.errors.email?.message}>
        <Input type="email" autoComplete="username" autoFocus {...register('email')} />
      </Field>
      <Field label="Password" error={formState.errors.password?.message}>
        <Input type="password" autoComplete="current-password" {...register('password')} />
      </Field>
      <Link href="/forgot-password" className="-mt-1 justify-self-end text-sm font-medium text-primary hover:underline">Forgot password?</Link>
      <Button type="submit" size="lg" loading={formState.isSubmitting}>Sign in</Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your workspace."
      footer={<>New to nbills? <Link href="/signup" className="font-medium text-primary hover:underline">Start a free trial</Link></>}
    >
      <Suspense><LoginForm /></Suspense>
    </AuthShell>
  );
}
