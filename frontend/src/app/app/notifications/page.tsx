'use client';
import { useQuery } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { PageHeader } from '@/components/data';
import { Button, Card, Empty, Pagination, QueryState, Skeleton, Tabs } from '@/components/ui';
import { Item, useNotificationActions, type Notification } from '@/features/notifications/notifications';
import { api, type Page } from '@/lib/api';
import { useSession } from '@/lib/session';

export default function NotificationsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { companyId } = useSession();
  const unreadOnly = params.get('tab') === 'unread';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const limit = 20;
  const q = useQuery({
    queryKey: ['/notifications', companyId, unreadOnly, page],
    queryFn: () => api<Page<Notification>>('/notifications', { query: { page, limit, unread: unreadOnly || undefined }, noService: true }),
  });
  const { mark, readAll } = useNotificationActions();
  const go = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) if (v) next.set(k, v); else next.delete(k);
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  return (
    <>
      <PageHeader title="Notifications" description="Invoice, payment and team activity that needs your attention."
        actions={<Button variant="secondary" loading={readAll.isPending} onClick={() => readAll.mutate()}><CheckCheck className="size-4" /> Mark all read</Button>} />
      <Tabs value={unreadOnly ? 'unread' : 'all'} onValueChange={(v) => go({ tab: v === 'unread' ? 'unread' : undefined, page: undefined })} tabs={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread' }]} className="mb-4" />
      <Card>
        <QueryState query={q} loading={<div className="space-y-3 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>}
          isEmpty={(d) => !d.data.length}
          empty={<Empty icon={<Bell className="size-5" />} title={unreadOnly ? 'No unread notifications' : 'No notifications yet'} description="We’ll let you know when invoices are issued, paid or overdue." />}>
          {(d) => (
            <>
              <ul className="divide-y">
                {d.data.map((n) => (
                  <Item key={n.id} n={n}
                    onOpen={() => { if (!n.readAt) mark.mutate({ id: n.id, read: true }); if (n.link) router.push(n.link); }}
                    actions={<button onClick={() => mark.mutate({ id: n.id, read: !n.readAt })} className="shrink-0 self-center text-xs font-medium text-fg-muted hover:text-fg">{n.readAt ? 'Mark unread' : 'Mark read'}</button>} />
                ))}
              </ul>
              <Pagination page={page} limit={limit} total={d.meta.total} onPage={(p) => go({ page: p > 1 ? String(p) : undefined })} className="border-t p-3" />
            </>
          )}
        </QueryState>
      </Card>
    </>
  );
}
