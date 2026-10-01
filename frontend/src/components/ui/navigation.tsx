'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Fragment } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';

const LIMITS = [10, 20, 50, 100];

export function Pagination({ page, limit, total, onPage, onLimit, className }: {
  page: number; limit: number; total: number; onPage: (p: number) => void; onLimit?: (l: number) => void; className?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  return (
    <nav aria-label="Pagination" className={cn('flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-fg-muted', className)}>
      <span className="num">
        {from}–{to} of {total.toLocaleString('en-IN')}
      </span>
      <div className="flex items-center gap-2">
        {onLimit && (
          <label className="hidden items-center gap-2 sm:flex">
            <span>Rows</span>
            <select value={limit} onChange={(e) => onLimit(Number(e.target.value))} className="select-chevron h-8 cursor-pointer appearance-none rounded-lg border border-border-input bg-surface pl-2 pr-7 text-xs hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-ring/60">
              {LIMITS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
        )}
        <Button variant="secondary" size="icon-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
        <span className="num min-w-14 text-center" aria-current="page">{page} / {pages}</span>
        <Button variant="secondary" size="icon-sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight className="size-4" /></Button>
      </div>
    </nav>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2 overflow-x-auto">
      <ol className="flex items-center gap-1.5 whitespace-nowrap text-sm text-fg-muted">
        {items.map((it, i) => (
          <Fragment key={i}>
            {i > 0 && <ChevronRight className="size-3.5 shrink-0" aria-hidden />}
            <li className="truncate">
              {it.href ? <Link href={it.href} className="hover:text-fg">{it.label}</Link> : <span aria-current="page" className="text-fg">{it.label}</span>}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
