'use client';
import { Check, Clock } from 'lucide-react';
import { motion } from 'motion/react';

const stages = [
  { name: 'Advance', pct: 40, due: 'On signing', state: 'paid' },
  { name: 'Delivery', pct: 35, due: 'Due 15 Oct', state: 'paid' },
  { name: 'Installation', pct: 15, due: 'Due 30 Oct', state: 'partial' },
  { name: 'Retention', pct: 10, due: 'No due date', state: 'open' },
] as const;

/** Animated payment-stage timeline used on the landing page. */
export function StageTimeline() {
  return (
    <div className="rounded-2xl border bg-surface p-5 shadow-md sm:p-6" aria-label="Example payment schedule">
      <div className="flex items-center justify-between text-sm">
        <p className="font-semibold">NSS-INV-000042</p>
        <span className="num text-fg-muted">₹12,50,000</span>
      </div>
      <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-muted">
        {stages.map((s, i) => (
          <motion.div key={s.name} initial={{ width: 0 }} whileInView={{ width: `${s.pct}%` }} viewport={{ once: true }} transition={{ delay: 0.2 + i * 0.25, duration: 0.6 }}
            className={s.state === 'paid' ? 'bg-success' : s.state === 'partial' ? 'bg-warning' : 'bg-border-strong'} />
        ))}
      </div>
      <ol className="mt-5 space-y-3">
        {stages.map((s, i) => (
          <motion.li key={s.name} initial={{ opacity: 0, x: -12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.3 + i * 0.25 }}
            className="flex items-center gap-3 text-sm">
            <span className={`grid size-7 shrink-0 place-items-center rounded-full ${s.state === 'paid' ? 'bg-success-soft text-success' : s.state === 'partial' ? 'bg-warning-soft text-warning' : 'bg-muted text-fg-muted'}`}>
              {s.state === 'paid' ? <Check className="size-3.5" aria-hidden /> : <Clock className="size-3.5" aria-hidden />}
            </span>
            <span className="min-w-0 flex-1"><span className="font-medium">Stage {i + 1} · {s.name}</span><span className="block text-xs text-fg-muted">{s.due}</span></span>
            <span className="num text-fg-muted">{s.pct}%</span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
