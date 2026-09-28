'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';
import { Check, ChevronsUpDown, Loader2, Plus, X } from 'lucide-react';
import { useDeferredValue, useId, useState, type ReactNode } from 'react';
import { api, type Page } from '@/lib/api';
import type { Id } from '@/lib/ids';
import { cn } from '@/lib/utils';
import { Popover } from './overlay';

type Item = { id: Id } & Record<string, unknown>;

/**
 * Searchable select backed by a paginated list endpoint (`?search=&limit=`).
 * `selectedLabel` shows the current value before its page has loaded.
 */
export function Combobox<T extends Item>({
  path, value, onChange, label, sub, query, placeholder = 'Select…', selectedLabel, disabled, clearable, onCreate, createLabel, id, className, invalid,
}: {
  path: string;
  value: Id | null | undefined;
  onChange: (id: Id | null, item?: T) => void;
  label: (item: T) => string;
  sub?: (item: T) => ReactNode;
  query?: Record<string, string | number | undefined>;
  placeholder?: string;
  selectedLabel?: string;
  disabled?: boolean;
  clearable?: boolean;
  onCreate?: (search: string) => void;
  createLabel?: string;
  id?: string;
  className?: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search);
  const [picked, setPicked] = useState<T | null>(null);
  const listId = useId();
  const list = useQuery({
    queryKey: [path, 'combobox', q, query],
    queryFn: () => api<Page<T>>(path, { query: { search: q, limit: 20, page: 1, ...query } }),
    enabled: open,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const found = picked?.id === value ? picked : list.data?.data.find((i) => i.id === value);
  const current = found ? label(found) : selectedLabel;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => { setOpen(o); if (!o) setSearch(''); }}
      trigger={
        <button
          type="button"
          id={id}
          disabled={disabled}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={listId}
          aria-invalid={invalid || undefined}
          className={cn(
            'flex h-9 w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg border bg-surface px-3 text-left text-sm shadow-sm transition-colors hover:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger',
            className,
          )}
        >
          <span className={cn('min-w-0 flex-1 truncate', !value && 'text-fg-subtle')}>{value ? (current ?? 'Selected') : placeholder}</span>
          {clearable && value && !disabled ? (
            <span role="button" tabIndex={-1} aria-label="Clear selection" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onChange(null); setPicked(null); }}
              className="rounded p-0.5 text-fg-muted hover:bg-muted"><X className="size-3.5" /></span>
          ) : (
            <ChevronsUpDown className="size-4 shrink-0 text-fg-muted" aria-hidden />
          )}
        </button>
      }
    >
      <Command id={listId} shouldFilter={false} className="flex flex-col">
        <div className="flex items-center border-b px-3">
          <Command.Input value={search} onValueChange={setSearch} placeholder="Type to search…" className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-fg-subtle" />
          {list.isFetching && <Loader2 className="size-4 animate-spin text-fg-muted" aria-hidden />}
        </div>
        <Command.List className="max-h-64 overflow-y-auto overscroll-contain p-1">
          {!list.isLoading && (
            <Command.Empty className="px-3 py-6 text-center text-sm text-fg-muted">{q ? `No matches for “${q}”` : 'Nothing to choose yet'}</Command.Empty>
          )}
          {list.isLoading && <div className="px-3 py-6 text-center text-sm text-fg-muted">Loading…</div>}
          {list.data?.data.map((item) => (
            <Command.Item
              key={item.id}
              value={String(item.id)}
              onSelect={() => { setPicked(item); onChange(item.id, item); setOpen(false); setSearch(''); }}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm data-[selected=true]:bg-muted"
            >
              <Check className={cn('size-4 shrink-0 text-primary', item.id === value ? 'opacity-100' : 'opacity-0')} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{label(item)}</span>
                {sub && <span className="block truncate text-xs text-fg-muted">{sub(item)}</span>}
              </span>
            </Command.Item>
          ))}
          {onCreate && (
            <Command.Item value="__create" onSelect={() => { onCreate(search); setOpen(false); }}
              className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg border-t px-2.5 py-2 text-sm text-primary data-[selected=true]:bg-primary-soft">
              <Plus className="size-4" /> {createLabel ?? 'Create new'}{search && ` “${search}”`}
            </Command.Item>
          )}
        </Command.List>
      </Command>
    </Popover>
  );
}
