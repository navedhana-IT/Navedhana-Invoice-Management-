'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ArrowUpDown, Inbox, Search, SearchX, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type Page } from '@/lib/api';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Button, Card, Empty, ErrorState, Input, Pagination, Skeleton } from './ui';
import type { Id } from '@/lib/ids';

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div className="min-w-0">
        {back}
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">{actions}</div>}
    </div>
  );
}

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: 'right';
  /** Backend sort field; makes the header clickable. */
  sort?: string;
  /** Hide in the mobile card layout. */
  hideOnMobile?: boolean;
  /** Use as the card title in the mobile layout. */
  primary?: boolean;
};

type SortState = { field: string; dir: 'asc' | 'desc' } | null;

function SortIcon({ dir }: { dir?: 'asc' | 'desc' }) {
  if (dir === 'asc') return <ArrowUp className="size-3.5" aria-hidden />;
  if (dir === 'desc') return <ArrowDown className="size-3.5" aria-hidden />;
  return <ArrowUpDown className="size-3.5 opacity-40" aria-hidden />;
}

export function DataTable<T extends { id: Id }>({ columns, rows, loading, onRowClick, empty, sort, onSort, rowLabel }: {
  columns: Column<T>[];
  rows?: T[];
  loading?: boolean;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  sort?: SortState;
  onSort?: (field: string) => void;
  rowLabel?: (row: T) => string;
}) {
  if (!loading && rows?.length === 0) return <>{empty ?? <Empty icon={<Inbox className="size-5" />} title="Nothing here yet" />}</>;
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const rest = columns.filter((c) => c !== primary && !c.hideOnMobile);
  const activate = (r: T) => onRowClick && { onClick: () => onRowClick(r), onKeyDown: (e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onRowClick(r)), tabIndex: 0, role: 'button' as const, 'aria-label': rowLabel?.(r) };

  return (
    <>
      {/* Mobile: stacked cards */}
      <ul className="divide-y md:hidden" aria-busy={loading || undefined}>
        {loading
          ? Array.from({ length: 4 }, (_, i) => <li key={i} className="space-y-2 p-4"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-3/4" /></li>)
          : rows!.map((r) => (
              <li key={r.id} {...activate(r)} className={cn('p-4', onRowClick && 'cursor-pointer active:bg-muted focus-visible:bg-muted focus-visible:outline-none')}>
                <div className="min-w-0 font-medium">{primary.cell(r)}</div>
                {rest.length > 0 && (
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    {rest.map((c) => (
                      <div key={c.key} className="min-w-0">
                        <dt className="text-fg-muted">{c.header}</dt>
                        <dd className={cn('truncate text-sm', c.align === 'right' && 'num')}>{c.cell(r)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            ))}
      </ul>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-surface-2 text-left text-xs uppercase tracking-wide text-fg-muted">
              {columns.map((c) => {
                const active = sort && c.sort === sort.field ? sort.dir : undefined;
                return (
                  <th key={c.key} scope="col" aria-sort={c.sort ? (active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none') : undefined}
                    className={cn('whitespace-nowrap px-4 py-2.5 font-medium', c.align === 'right' && 'text-right', c.className)}>
                    {c.sort && onSort ? (
                      <button type="button" onClick={() => onSort(c.sort!)} className={cn('inline-flex cursor-pointer items-center gap-1 uppercase hover:text-fg', active && 'text-fg')}>
                        {c.header} <SortIcon dir={active} />
                      </button>
                    ) : c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading
              ? Array.from({ length: 5 }, (_, i) => (
                  <tr key={i}>{columns.map((c) => <td key={c.key} className="px-4 py-3"><Skeleton className="h-4 w-full max-w-32" /></td>)}</tr>
                ))
              : rows!.map((r) => (
                  <tr key={r.id} {...activate(r)}
                    className={cn('transition-colors', onRowClick && 'cursor-pointer hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none')}>
                    {columns.map((c) => <td key={c.key} className={cn('whitespace-nowrap px-4 py-3', c.align === 'right' && 'num text-right', c.className)}>{c.cell(r)}</td>)}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

type ListOptions = {
  /** Always-sent params not reflected in the URL (e.g. direction). */
  fixed?: Record<string, string | undefined>;
  /** URL-backed filter keys, e.g. ['status', 'from', 'to']. */
  filters?: string[];
  /** Default sort, `field:dir`. */
  sort?: string;
  limit?: number;
  enabled?: boolean;
};

/**
 * Server-paginated list whose page, size, search, sort and filters live in the URL,
 * so refresh, back/forward and shared links keep the exact view.
 */
export function useList<T>(path: string, opts: ListOptions = {}) {
  const { companyId, serviceId } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filterKeys = opts.filters ?? [];

  const page = Math.max(1, Number(params.get('page')) || 1);
  const limit = Math.min(100, Number(params.get('limit')) || opts.limit || 20);
  const search = params.get('q') ?? '';
  const sortRaw = params.get('sort') ?? opts.sort ?? '';
  const [sf, sd] = sortRaw.split(':');
  const sort: SortState = sf ? { field: sf, dir: sd === 'asc' ? 'asc' : 'desc' } : null;
  const filters = useMemo(() => Object.fromEntries(filterKeys.map((k) => [k, params.get(k) ?? undefined])) as Record<string, string | undefined>, [params, filterKeys.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback((patch: Record<string, string | number | undefined | null>, resetPage = true) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === null || v === '') next.delete(k);
      else next.set(k, String(v));
    }
    if (resetPage && !('page' in patch)) next.delete('page');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  const query = useQuery({
    queryKey: [path, companyId, serviceId, page, limit, search, sortRaw, filters, opts.fixed],
    queryFn: ({ signal }) => api<Page<T>>(path, { query: { page, limit, search, sort: sortRaw || undefined, ...filters, ...opts.fixed }, signal }),
    placeholderData: keepPreviousData,
    enabled: opts.enabled ?? true,
  });

  const activeFilters = filterKeys.filter((k) => filters[k]).length;
  return {
    ...query,
    page, limit, search, sort, filters, activeFilters,
    setPage: (p: number) => update({ page: p > 1 ? p : undefined }, false),
    setLimit: (l: number) => update({ limit: l === (opts.limit || 20) ? undefined : l }),
    setSearch: (s: string) => update({ q: s.trim() || undefined }),
    setFilter: (k: string, v: string | undefined) => update({ [k]: v }),
    setFilters: (patch: Record<string, string | undefined>) => update(patch),
    toggleSort: (field: string) => {
      const dir = sort?.field === field && sort.dir === 'asc' ? 'desc' : sort?.field === field ? 'asc' : 'desc';
      update({ sort: `${field}:${dir}` === opts.sort ? undefined : `${field}:${dir}` });
    },
    clear: () => update({ q: undefined, sort: undefined, ...Object.fromEntries(filterKeys.map((k) => [k, undefined])) }),
  };
}

export type ListState<T> = ReturnType<typeof useList<T>>;

/** Debounced search box bound to the list's URL `q` param. */
function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text.trim() === value) return;
    const t = setTimeout(() => onChange(text), 300);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" aria-hidden />
      <Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="pl-9 pr-8" />
      {text && (
        <button type="button" onClick={() => { setText(''); onChange(''); }} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-fg-muted hover:bg-muted">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function ListCard<T extends { id: Id }>({ list, columns, onRowClick, toolbar, empty, searchPlaceholder = 'Search…', rowLabel, footer }: {
  list: ListState<T>;
  columns: Column<T>[];
  onRowClick?: (r: T) => void;
  toolbar?: ReactNode;
  empty?: ReactNode;
  searchPlaceholder?: string;
  rowLabel?: (row: T) => string;
  footer?: ReactNode;
}) {
  const meta = list.data?.meta;
  const filtered = !!list.search || list.activeFilters > 0;
  return (
    <Card>
      <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchBox value={list.search} onChange={list.setSearch} placeholder={searchPlaceholder} />
        {toolbar && <div className="flex flex-wrap items-center gap-2 [&>*]:min-w-0 [&>*]:flex-1 sm:[&>*]:flex-none">{toolbar}</div>}
        {filtered && (
          <Button variant="ghost" size="sm" onClick={list.clear} className="sm:ml-auto">
            <X className="size-3.5" /> Clear filters
          </Button>
        )}
      </div>
      {list.isError && !list.data ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <div className={cn('transition-opacity', list.isPlaceholderData && 'opacity-60')}>
          <DataTable
            columns={columns}
            rows={list.data?.data}
            loading={list.isLoading}
            onRowClick={onRowClick}
            sort={list.sort}
            onSort={list.toggleSort}
            rowLabel={rowLabel}
            empty={filtered
              ? <Empty icon={<SearchX className="size-5" />} title="No matching records" description="Try a different search or clear the filters." action={<Button variant="secondary" onClick={list.clear}>Clear filters</Button>} />
              : empty}
          />
        </div>
      )}
      {footer}
      {meta && meta.total > 0 && (meta.total > meta.limit || list.page > 1 || meta.limit !== 20) && (
        <Pagination page={list.page} limit={list.limit} total={meta.total} onPage={list.setPage} onLimit={list.setLimit} />
      )}
    </Card>
  );
}

/** A labelled filter <select> that reads/writes one URL filter key. */
export function FilterSelect<T>({ list, name, label, options }: { list: ListState<T>; name: string; label: string; options: { value: string; label: string }[] }) {
  return (
    <select
      aria-label={label}
      value={list.filters[name] ?? ''}
      onChange={(e) => list.setFilter(name, e.target.value || undefined)}
      className="select-chevron h-9 cursor-pointer appearance-none rounded-lg border bg-surface pl-3 pr-8 text-sm shadow-sm hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-ring/60"
    >
      <option value="">{label}: All</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** From/to date inputs bound to URL filter keys. */
export function DateRangeFilter<T>({ list, from = 'from', to = 'to', label = 'Date' }: { list: ListState<T>; from?: string; to?: string; label?: string }) {
  const cls = 'h-9 min-w-0 flex-1 rounded-lg border bg-surface px-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/60 sm:flex-none sm:px-2';
  return (
    <div className="flex w-full min-w-0 items-center gap-1 sm:w-auto sm:gap-1.5" role="group" aria-label={`${label} range`}>
      <input type="date" aria-label={`${label} from`} value={list.filters[from] ?? ''} max={list.filters[to]} onChange={(e) => list.setFilter(from, e.target.value || undefined)} className={cls} />
      <span className="text-fg-muted" aria-hidden>–</span>
      <input type="date" aria-label={`${label} to`} value={list.filters[to] ?? ''} min={list.filters[from]} onChange={(e) => list.setFilter(to, e.target.value || undefined)} className={cls} />
    </div>
  );
}
