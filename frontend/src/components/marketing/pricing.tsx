'use client';
import { Check, Minus } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useState } from 'react';
import { FEATURE_FLAGS, featureLabel, LIMIT_LABELS, limitText, priceText, storageText } from '@/lib/plans';
import type { PublicPlan } from '@/lib/seo';
import { cn } from '@/lib/utils';

/** Live plans from the API. The interval toggle appears only when both monthly and yearly plans exist. */
export function PricingCards({ plans }: { plans: PublicPlan[] }) {
  const intervals = [...new Set(plans.map((p) => p.interval))];
  const [interval, setBilling] = useState<PublicPlan['interval']>(intervals.includes('MONTHLY') ? 'MONTHLY' : intervals[0] ?? 'MONTHLY');
  const shown = intervals.length > 1 ? plans.filter((p) => p.interval === interval) : plans;

  if (plans.length === 0) {
    return <p className="mt-12 rounded-2xl border bg-surface p-8 text-center text-fg-muted">Pricing is being updated. Please check back shortly or <Link href="/contact" className="font-medium text-primary hover:underline">contact us</Link>.</p>;
  }

  return (
    <div className="mt-10">
      {intervals.length > 1 && (
        <div role="radiogroup" aria-label="Billing interval" className="mx-auto mb-10 flex w-fit rounded-full border bg-surface p-1 shadow-sm">
          {(['MONTHLY', 'YEARLY'] as const).map((i) => (
            <button key={i} role="radio" aria-checked={interval === i} onClick={() => setBilling(i)}
              className={cn('relative rounded-full px-5 py-2 text-sm font-medium transition-colors', interval === i ? 'text-primary-fg' : 'text-fg-muted hover:text-fg')}>
              {interval === i && <motion.span layoutId="interval-pill" className="absolute inset-0 rounded-full bg-primary" transition={{ type: 'spring', duration: 0.4 }} />}
              <span className="relative">{i === 'MONTHLY' ? 'Monthly' : 'Yearly'}</span>
            </button>
          ))}
        </div>
      )}
      <div className={cn('grid gap-5', shown.length >= 3 ? 'lg:grid-cols-3' : shown.length === 2 ? 'md:grid-cols-2 lg:mx-auto lg:max-w-4xl' : 'mx-auto max-w-md')}>
        {shown.map((p, idx) => (
          <motion.div key={p.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: idx * 0.08 }}
            className={cn('relative flex flex-col rounded-2xl border bg-surface p-6 shadow-sm sm:p-8', p.highlighted && 'border-primary shadow-lg shadow-primary/10 ring-1 ring-primary lg:-my-3 lg:py-11')}>
            {p.highlighted && <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-fg shadow-sm">Most popular</span>}
            <h3 className="text-lg font-semibold">{p.name}</h3>
            {p.description && <p className="mt-1 text-sm text-fg-muted">{p.description}</p>}
            <p className="mt-5 flex items-baseline gap-1">
              <span className="num text-4xl font-semibold tracking-tight">{Number(p.price) === 0 ? 'Free' : priceText(p.price, p.currency)}</span>
              {Number(p.price) > 0 && <span className="text-sm text-fg-muted">/ {p.interval === 'YEARLY' ? 'year' : 'month'}</span>}
            </p>
            <p className="mt-1 text-xs text-fg-subtle">{p.trialDays > 0 ? `${p.trialDays}-day free trial · ` : ''}Taxes extra</p>
            <Link href={`/signup?plan=${p.id}`}
              className={cn('mt-6 inline-flex h-11 items-center justify-center rounded-xl text-sm font-medium transition', p.highlighted ? 'bg-primary text-primary-fg shadow-sm hover:bg-primary-hover' : 'border bg-surface hover:bg-muted')}>
              {p.trialDays > 0 ? 'Start free trial' : 'Get started'}
            </Link>
            <ul className="mt-7 flex-1 space-y-2.5 border-t pt-6 text-sm">
              {LIMIT_LABELS.slice(0, 3).map(([k, s, pl]) => <li key={k} className="flex gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />{limitText(p.limits, k, s, pl)}</li>)}
              <li className="flex gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />{storageText(p.limits)}</li>
              {FEATURE_FLAGS.map(([k, label]) => (
                <li key={k} className={cn('flex gap-2.5', !p.limits[k] && 'text-fg-subtle')}>
                  {p.limits[k] ? <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : <Minus className="mt-0.5 size-4 shrink-0" aria-hidden />}
                  <span>{label}{!p.limits[k] && <span className="sr-only"> (not included)</span>}</span>
                </li>
              ))}
              {p.features.map((f) => <li key={f} className="flex gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />{featureLabel(f)}</li>)}
            </ul>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
