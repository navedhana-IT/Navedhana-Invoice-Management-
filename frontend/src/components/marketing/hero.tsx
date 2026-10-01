'use client';
import { ArrowRight, BellRing, CheckCircle2, Sparkles } from 'lucide-react';
import { motion, useScroll, useTransform } from 'motion/react';
import Link from 'next/link';
import { useRef } from 'react';

const bars = [38, 52, 44, 61, 58, 72, 66, 81, 77, 90, 84, 96];

export function Hero({ trialDays }: { trialDays?: number }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const yMock = useTransform(scrollYProgress, [0, 1], [0, 60]);
  const yCard = useTransform(scrollYProgress, [0, 1], [0, -40]);

  return (
    <section ref={ref} className="relative overflow-hidden">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(99,102,241,0.16),transparent_70%)]" />
      <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-[640px] bg-[linear-gradient(to_right,rgba(99,102,241,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(99,102,241,0.06)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" />
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-14 text-center sm:px-6 sm:pt-20 lg:pb-24 lg:pt-24">
        <motion.span initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 rounded-full border bg-surface px-3 py-1 text-xs font-medium text-fg-muted shadow-sm">
          <Sparkles className="size-3.5 text-primary" aria-hidden /> GST invoicing for multi-brand businesses
        </motion.span>
        <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.05 }}
          className="mx-auto mt-6 max-w-4xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
          Every brand. Every invoice.{' '}
          <span className="bg-gradient-to-r from-[#fd8904] via-[#fe5003] to-[#fb743a] bg-clip-text text-transparent">One ledger.</span>
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.12 }}
          className="mx-auto mt-5 max-w-2xl text-pretty text-base text-fg-muted sm:text-lg">
          Branded GST invoices, staged payment collection, receipts and audit-ready reports — for every service your company runs, from one secure workspace.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.18 }}
          className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/signup" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-medium text-primary-fg shadow-lg shadow-primary/25 transition hover:bg-primary-hover">
            Start free{trialDays ? ` — ${trialDays}-day trial` : ''} <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Link href="/pricing" className="inline-flex h-12 items-center justify-center rounded-xl border bg-surface px-6 font-medium shadow-sm transition hover:bg-muted">See pricing</Link>
        </motion.div>
        <p className="mt-4 text-xs text-fg-subtle">No credit card required · Your data stays yours</p>

        {/* Product mock */}
        <div className="relative mx-auto mt-14 max-w-5xl" aria-hidden>
          <motion.div style={{ y: yMock }} initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl border bg-surface p-2 shadow-lg ring-1 ring-black/5">
            <div className="flex items-center gap-1.5 border-b px-3 pb-2">
              <span className="size-2.5 rounded-full bg-red-400" /><span className="size-2.5 rounded-full bg-amber-400" /><span className="size-2.5 rounded-full bg-emerald-400" />
              <span className="ml-3 hidden rounded-md bg-muted px-3 py-0.5 text-[11px] text-fg-subtle sm:block">app.navedhana.com/app</span>
            </div>
            <div className="grid gap-3 p-3 text-left sm:grid-cols-[160px_1fr] sm:p-4">
              <div className="hidden space-y-1.5 sm:block">
                {['Dashboard', 'Sales invoices', 'Payments', 'Customers', 'Reports', 'Brands'].map((l, i) => (
                  <div key={l} className={`rounded-md px-2.5 py-1.5 text-xs ${i === 0 ? 'bg-primary-soft font-medium text-primary' : 'text-fg-muted'}`}>{l}</div>
                ))}
              </div>
              <div className="min-w-0 space-y-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[['Collected', '₹18.4L'], ['Receivables', '₹6.2L'], ['Payables', '₹2.1L'], ['Overdue', '3']].map(([k, v], i) => (
                    <motion.div key={k} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 + i * 0.08 }} className="rounded-lg border p-2.5">
                      <p className="text-[10px] text-fg-muted">{k}</p><p className="num mt-0.5 text-sm font-semibold">{v}</p>
                    </motion.div>
                  ))}
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[11px] font-medium text-fg-muted">Invoiced vs collected</p>
                  <div className="mt-3 flex h-24 items-end gap-1.5 sm:h-32">
                    {bars.map((h, i) => (
                      <motion.div key={i} initial={{ height: 0 }} animate={{ height: `${h}%` }} transition={{ delay: 0.6 + i * 0.04, duration: 0.6, ease: 'easeOut' }}
                        className="flex-1 rounded-t bg-gradient-to-t from-[#fe5003]/80 to-[#fd8904]/70" />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div style={{ y: yCard }} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1, duration: 0.6 }}
            className="absolute -right-2 top-16 hidden w-60 rounded-xl border bg-surface p-4 text-left shadow-lg md:block lg:-right-10">
            <div className="flex items-center justify-between"><p className="text-xs font-semibold">LSP-INV-000128</p><span className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-medium text-success">Paid</span></div>
            <p className="mt-1 text-[11px] text-fg-muted">Lotus Solar Power · Acme Textiles</p>
            <div className="mt-3 space-y-1.5 text-[11px]">
              {[['Advance', '40%'], ['Installation', '50%'], ['Retention', '10%']].map(([k, v]) => (
                <div key={k} className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-success" /><span className="flex-1">{k}</span><span className="num text-fg-muted">{v}</span></div>
              ))}
            </div>
            <div className="mt-3 flex justify-between border-t pt-2 text-xs font-semibold"><span>Total</span><span className="num">₹4,72,000</span></div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.5, duration: 0.5 }}
            className="absolute -bottom-6 left-2 flex items-center gap-3 rounded-xl border bg-surface px-4 py-3 text-left shadow-lg sm:left-6 lg:-left-8">
            <span className="grid size-8 place-items-center rounded-full bg-primary-soft text-primary"><BellRing className="size-4" /></span>
            <span><span className="block text-xs font-semibold">Payment received · ₹48,000</span><span className="block text-[11px] text-fg-muted">Receipt LSP-RCT-000112 generated</span></span>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
