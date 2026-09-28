'use client';
import { useQueryClient } from '@tanstack/react-query';
import { Clock, Lock, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SUBSCRIPTION_EVENT } from '@/lib/api';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

const DISMISS_KEY = 'nv.trialBanner.dismissed';

/** Trial countdown, or a read-only notice once the trial/subscription lapses (writes then return 402). */
export function TrialBanner() {
  const qc = useQueryClient();
  const { ctx } = useSession();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1'), []);
  useEffect(() => {
    const onLapsed = () => qc.invalidateQueries({ queryKey: ['ctx'] });
    window.addEventListener(SUBSCRIPTION_EVENT, onLapsed);
    return () => window.removeEventListener(SUBSCRIPTION_EVENT, onLapsed);
  }, [qc]);

  const company = ctx?.company;
  if (!company) return null;

  if (company.readOnly) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-900 lg:px-8 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
        <Lock className="size-4 shrink-0" aria-hidden />
        <span className="font-medium">{company.subscriptionStatus === 'TRIALING' ? 'Your free trial has ended.' : 'Your subscription has expired.'}</span>
        <span>Your data is safe, but the workspace is read-only until you upgrade.</span>
        <Link href="/contact?topic=upgrade" className="font-semibold underline underline-offset-2">Upgrade now</Link>
      </div>
    );
  }

  if (company.subscriptionStatus !== 'TRIALING' || !company.trialEndsAt) return null;
  const days = Math.max(0, Math.ceil((new Date(company.trialEndsAt).getTime() - Date.now()) / 86_400_000));
  const urgent = days <= 7;
  if (!urgent && dismissed) return null;

  return (
    <div role="status" className={cn('flex items-center gap-3 border-b px-4 py-2 text-sm lg:px-8',
      urgent ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200' : 'bg-primary-soft/60 text-fg')}>
      <Clock className="size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">
        <span className="font-medium">{days === 0 ? 'Your trial ends today.' : `${days} day${days === 1 ? '' : 's'} left in your ${company.plan?.name ?? ''} trial.`}</span>{' '}
        <Link href="/contact?topic=upgrade" className="font-semibold underline underline-offset-2">Choose a plan</Link> to keep issuing invoices without interruption.
      </p>
      {!urgent && (
        <button onClick={() => { sessionStorage.setItem(DISMISS_KEY, '1'); setDismissed(true); }} className="rounded p-1 hover:bg-black/5" aria-label="Dismiss trial notice"><X className="size-4" /></button>
      )}
    </div>
  );
}
