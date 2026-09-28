'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Popover, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { useSession } from '@/lib/session';
import { cn, dateTime } from '@/lib/utils';
import type { Id } from '@/lib/ids';

export type Notification = { id: Id; type: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string };

const UNREAD = ['notifications', 'unread'];

export function useNotificationActions() {
  const qc = useQueryClient();
  const refresh = () => { qc.invalidateQueries({ queryKey: UNREAD }); qc.invalidateQueries({ queryKey: ['/notifications'] }); qc.invalidateQueries({ queryKey: ['notifications', 'recent'] }); };
  const mark = useMutation({
    mutationFn: ({ id, read }: { id: Id; read: boolean }) => api(`/notifications/${id}/${read ? 'read' : 'unread'}`, { method: 'POST', noService: true }),
    onSuccess: refresh,
  });
  const readAll = useMutation({ mutationFn: () => api('/notifications/read-all', { method: 'POST', noService: true }), onSuccess: refresh });
  return { mark, readAll };
}

/** Keeps notifications and open invoices fresh from Socket.IO pushes. Mounted once in the app shell. */
export function RealtimeBridge() {
  const qc = useQueryClient();
  const router = useRouter();
  const { companyId } = useSession();
  useRealtime<Notification & { companyId: Id | null }>('notification', (n) => {
    if (n.companyId && n.companyId !== companyId) return;
    qc.invalidateQueries({ queryKey: ['notifications'] });
    qc.invalidateQueries({ queryKey: ['/notifications'] });
    toast(n.title, { description: n.body ?? undefined, action: n.link ? { label: 'Open', onClick: () => router.push(n.link!) } : undefined });
  });
  useRealtime<{ companyId: Id; invoiceId: Id }>('invoice.updated', (p) => {
    if (p.companyId !== companyId) return;
    qc.invalidateQueries({ queryKey: ['invoice', p.invoiceId] });
    qc.invalidateQueries({ queryKey: ['/invoices'] });
    qc.invalidateQueries({ queryKey: ['/payments'] });
  });
  return null;
}

export function NotificationBell() {
  const { companyId } = useSession();
  const router = useRouter();
  const unread = useQuery({ queryKey: [...UNREAD, companyId], queryFn: () => api<{ count: number }>('/notifications/unread-count', { noService: true }), refetchInterval: 120_000 });
  const recent = useQuery({ queryKey: ['notifications', 'recent', companyId], queryFn: () => api<{ data: Notification[] }>('/notifications', { query: { limit: 8 }, noService: true }) });
  const { mark, readAll } = useNotificationActions();
  const count = unread.data?.count ?? 0;
  const [shown, setShown] = useState(false);

  const open = (n: Notification) => {
    if (!n.readAt) mark.mutate({ id: n.id, read: true });
    if (n.link) { setShown(false); router.push(n.link); }
  };

  return (
    <Popover
      open={shown}
      onOpenChange={setShown}
      align="end"
      className="w-[min(22rem,calc(100vw-1.5rem))] p-0"
      trigger={
        <button className="relative rounded-lg p-2 text-fg-muted hover:bg-muted hover:text-fg" aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}>
          <Bell className="size-5" />
          {count > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-4 text-white">{count > 99 ? '99+' : count}</span>}
        </button>
      }
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <p className="text-sm font-semibold">Notifications</p>
        {count > 0 && <button onClick={() => readAll.mutate()} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><CheckCheck className="size-3.5" /> Mark all read</button>}
      </div>
      <div className="max-h-96 overflow-y-auto">
        {recent.isLoading ? <div className="space-y-2 p-4"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
          : !recent.data?.data.length ? <p className="p-6 text-center text-sm text-fg-muted">You’re all caught up.</p>
          : <ul className="divide-y">{recent.data.data.map((n) => <Item key={n.id} n={n} onOpen={() => open(n)} />)}</ul>}
      </div>
      <Link href="/app/notifications" onClick={() => setShown(false)} className="block border-t px-4 py-2.5 text-center text-sm font-medium text-primary hover:bg-muted">View all</Link>
    </Popover>
  );
}

export function Item({ n, onOpen, actions }: { n: Notification; onOpen: () => void; actions?: React.ReactNode }) {
  return (
    <li className={cn('flex gap-3 px-4 py-3', !n.readAt && 'bg-primary-soft/40')}>
      <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-primary')} aria-hidden />
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className={cn('text-sm', !n.readAt && 'font-medium')}>{n.title}{!n.readAt && <span className="sr-only"> (unread)</span>}</p>
        {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-fg-muted">{n.body}</p>}
        <p className="mt-1 text-[11px] text-fg-subtle">{dateTime(n.createdAt)}</p>
      </button>
      {actions}
    </li>
  );
}
