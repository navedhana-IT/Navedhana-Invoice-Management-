'use client';
import { AlertTriangle, CheckCircle2, Info, RefreshCw, SearchX, ShieldAlert, WifiOff, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Skeleton } from './card';

export function Empty({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-6 py-12 text-center sm:py-14', className)}>
      {icon && <div className="mb-1 rounded-full bg-muted p-3 text-fg-muted" aria-hidden>{icon}</div>}
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-3 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

const alertTones = {
  info: { cls: 'border-info/20 bg-info-soft text-info', icon: Info },
  success: { cls: 'border-success/20 bg-success-soft text-success', icon: CheckCircle2 },
  warning: { cls: 'border-warning/25 bg-warning-soft text-warning', icon: AlertTriangle },
  danger: { cls: 'border-danger/20 bg-danger-soft text-danger', icon: XCircle },
};

export function Alert({ tone = 'info', title, children, action, className }: { tone?: keyof typeof alertTones; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  const t = alertTones[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex flex-wrap items-start gap-3 rounded-xl border px-4 py-3 text-sm', t.cls, className)}>
      <t.icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-fg">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn('text-fg-muted', title && 'mt-0.5')}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

/** Friendly copy for a failed query, by status. Never shows raw technical errors. */
export function describeError(error: unknown): { title: string; description: string; icon: ReactNode } {
  if (error instanceof ApiError) {
    if (error.status === 403) return { title: 'You don’t have access to this', description: 'Ask your company admin for the permission you need.', icon: <ShieldAlert className="size-5" /> };
    if (error.status === 404) return { title: 'We couldn’t find that', description: 'It may have been removed, or the link is out of date.', icon: <SearchX className="size-5" /> };
    if (error.status === 0) return { title: 'You appear to be offline', description: 'Check your connection and try again.', icon: <WifiOff className="size-5" /> };
    if (error.status < 500) return { title: 'Something needs your attention', description: error.message, icon: <AlertTriangle className="size-5" /> };
  }
  return { title: 'Something went wrong on our side', description: 'Please try again in a moment. If it keeps happening, contact support.', icon: <AlertTriangle className="size-5" /> };
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const d = describeError(error);
  const ref = error instanceof ApiError ? error.requestId : undefined;
  return (
    <Empty
      className={className}
      icon={d.icon}
      title={d.title}
      description={<>{d.description}{ref && <span className="mt-2 block text-xs text-fg-subtle">Reference: {ref}</span>}</>}
      action={onRetry && <Button variant="secondary" onClick={onRetry}><RefreshCw className="size-4" /> Try again</Button>}
    />
  );
}

type QueryLike<T> = { data?: T; isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown };

/** Standard loading / error / empty / data switch for a single query. */
export function QueryState<T>({ query, loading, empty, isEmpty, children }: {
  query: QueryLike<T>; loading?: ReactNode; empty?: ReactNode; isEmpty?: (d: T) => boolean; children: (data: T) => ReactNode;
}) {
  if (query.isLoading) return <>{loading ?? <div className="space-y-3 p-5" aria-busy><Skeleton className="h-5 w-1/3" /><Skeleton className="h-24 w-full" /></div>}</>;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (query.data === undefined) return null;
  if (empty && isEmpty?.(query.data)) return <>{empty}</>;
  return <>{children(query.data)}</>;
}

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return <span role="status" aria-label={label} className={cn('inline-block size-5 animate-spin rounded-full border-2 border-primary/25 border-t-primary', className)} />;
}
