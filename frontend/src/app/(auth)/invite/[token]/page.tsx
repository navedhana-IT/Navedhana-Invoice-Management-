'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { AuthShell } from '@/components/auth-shell';
import { PasswordStrength } from '@/components/password-strength';
import { Alert, Button, buttonClass, Field, Input, Skeleton } from '@/components/ui';
import { api, ApiError, refreshSession, setAccessToken, tenant } from '@/lib/api';
import type { Me } from '@/lib/session';
import { date } from '@/lib/utils';
import type { Id } from '@/lib/ids';

type Lookup = { company: string; email: string; fullName: string; phone: string | null; accountExists: boolean; expiresAt: string };

const schema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(120),
  phone: z.union([z.literal(''), z.string().trim().regex(/^[+\d][\d\s-]{6,19}$/, 'Enter a valid phone number')]),
  password: z.string().regex(/^(?=.*[A-Za-z])(?=.*\d).{8,128}$/, 'Use at least 8 characters with a letter and a number'),
  confirm: z.string().min(1, 'Re-enter your password'),
}).refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords don’t match' });

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const lookup = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api<Lookup>('/invitations/lookup', { query: { token } }),
    retry: false,
  });
  // An existing account must be signed in as the invited email to accept.
  const signedIn = useQuery({
    queryKey: ['invite-me'],
    queryFn: async () => ((await refreshSession()) ? api<Me>('/me') : null),
    enabled: !!lookup.data?.accountExists,
    retry: false,
  });

  if (lookup.isPending) {
    return <AuthShell title="Loading your invitation…"><div className="grid gap-3"><Skeleton className="h-16" /><Skeleton className="h-9" /><Skeleton className="h-9" /></div></AuthShell>;
  }
  if (lookup.error) {
    const err = lookup.error as ApiError;
    return (
      <AuthShell title={err.code === 'INVITATION_USED' ? 'Invitation already used' : 'This invitation can’t be used'} footer={<Link href="/" className="font-medium text-primary hover:underline">← nbills home</Link>}>
        <div className="grid gap-4">
          <Alert tone={err.code === 'INVITATION_USED' ? 'info' : 'warning'}>{err.message}</Alert>
          <Link href="/login" className={buttonClass({ size: 'lg' })}>Go to sign in</Link>
        </div>
      </AuthShell>
    );
  }

  const inv = lookup.data;
  const header = (
    <div className="mb-6 flex items-center gap-3 rounded-xl border bg-surface p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary"><Building2 className="size-5" aria-hidden /></span>
      <div className="min-w-0 text-sm">
        <p className="truncate font-medium">{inv.company}</p>
        <p className="truncate text-fg-muted">Invitation for {inv.email} · expires {date(inv.expiresAt)}</p>
      </div>
    </div>
  );

  return (
    <AuthShell title={`Join ${inv.company}`} subtitle={inv.accountExists ? 'You already have an nbills account.' : 'Create your account to accept the invitation.'}>
      {header}
      {inv.accountExists ? <AcceptExisting token={token} inv={inv} me={signedIn.data} loading={signedIn.isPending} /> : <AcceptNew token={token} inv={inv} />}
    </AuthShell>
  );
}

function useAccept(token: string) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const accept = async (body: Record<string, string | undefined>) => {
    setError(null);
    try {
      const res = await api<{ accessToken: string; companyId: Id }>('/invitations/accept', { body: { token, ...body } });
      setAccessToken(res.accessToken);
      tenant.setCompany(res.companyId);
      router.replace('/app');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return { accept, error };
}

function AcceptExisting({ token, inv, me, loading }: { token: string; inv: Lookup; me: Me | null | undefined; loading: boolean }) {
  const { accept, error } = useAccept(token);
  const [busy, setBusy] = useState(false);
  const next = encodeURIComponent(`/invite/${token}`);
  if (loading) return <Skeleton className="h-10" />;
  if (!me || me.email.toLowerCase() !== inv.email.toLowerCase()) {
    return (
      <div className="grid gap-4">
        {me && <Alert tone="warning">You’re signed in as {me.email}. Sign in as {inv.email} to accept this invitation.</Alert>}
        <Link href={`/login?next=${next}`} className={buttonClass({ size: 'lg' })}>Sign in as {inv.email}</Link>
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      {error && <Alert tone="danger">{error}</Alert>}
      <Button size="lg" loading={busy} onClick={async () => { setBusy(true); await accept({}); setBusy(false); }}>Accept and open workspace</Button>
    </div>
  );
}

function AcceptNew({ token, inv }: { token: string; inv: Lookup }) {
  const { accept, error } = useAccept(token);
  const { register, handleSubmit, control, formState } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: inv.fullName, phone: inv.phone ?? '', password: '', confirm: '' },
  });
  const password = useWatch({ control, name: 'password' }) ?? '';
  const onSubmit = handleSubmit(({ fullName, phone, password }) => accept({ fullName, phone: phone || undefined, password }));

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Email"><Input value={inv.email} readOnly disabled autoComplete="username" /></Field>
      <Field label="Full name" required error={formState.errors.fullName?.message}><Input autoComplete="name" {...register('fullName')} /></Field>
      <Field label="Mobile number" error={formState.errors.phone?.message}><Input type="tel" autoComplete="tel" {...register('phone')} /></Field>
      <Field label="Password" required error={formState.errors.password?.message} hint="At least 8 characters with a letter and a number">
        <Input type="password" autoComplete="new-password" {...register('password')} />
      </Field>
      <PasswordStrength password={password} />
      <Field label="Confirm password" required error={formState.errors.confirm?.message}><Input type="password" autoComplete="new-password" {...register('confirm')} /></Field>
      <Button type="submit" size="lg" loading={formState.isSubmitting}>Create account and join</Button>
    </form>
  );
}
