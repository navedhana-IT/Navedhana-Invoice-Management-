import type { ReactNode } from 'react';
import { cn, titleCase } from '@/lib/utils';

export function Card({ className, children, id }: { className?: string; children: ReactNode; id?: string }) {
  return <div id={id} className={cn('rounded-xl border bg-surface shadow-sm', className)}>{children}</div>;
}

export function CardHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3.5 sm:px-5 sm:py-4">
      <div className="min-w-0">
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 text-sm text-fg-muted">
        <span className="truncate">{label}</span>
        {icon && <span className="rounded-lg bg-primary-soft p-1.5 text-primary" aria-hidden>{icon}</span>}
      </div>
      <div className="num mt-2 truncate text-xl font-semibold tracking-tight sm:text-2xl">{value}</div>
      {hint && <div className="mt-1 text-xs text-fg-muted">{hint}</div>}
    </Card>
  );
}

const good = 'bg-success-soft text-success';
const warn = 'bg-warning-soft text-warning';
const bad = 'bg-danger-soft text-danger';
const idle = 'bg-muted text-fg-muted';
const info = 'bg-info-soft text-info';
const brand = 'bg-primary-soft text-primary';

const tones: Record<string, string> = {
  PAID: good, ACTIVE: good, SUCCESS: good, PUBLISHED: good, ACCEPTED: good, SETTLED: good,
  PARTIALLY_PAID: warn, PENDING: warn, TRIALING: warn, DRAFT: idle,
  OVERDUE: bad, FAILED: bad, EXPIRED: bad, PAST_DUE: bad,
  CANCELLED: idle, VOID: idle, INACTIVE: idle, REFUNDED: idle, REVERSED: idle, REVOKED: idle, SUSPENDED: bad,
  ISSUED: brand, RECEIVED: info, OPEN: info, SENT: info,
};

export function Badge({ value, label, className }: { value: string; label?: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', tones[value] ?? idle, className)}>
      {label ?? titleCase(value)}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-muted', className)} />;
}
