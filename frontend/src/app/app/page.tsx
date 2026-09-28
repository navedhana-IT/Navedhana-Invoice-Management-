'use client';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, IndianRupee, Plus } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { PageHeader } from '@/components/data';
import { Badge, buttonClass, Card, CardHeader, Empty, ErrorState, Skeleton, Stat } from '@/components/ui';
import type { Id } from '@/lib/ids';

const RevenueChart = dynamic(() => import('@/features/dashboard/revenue-chart').then((m) => m.RevenueChart), { ssr: false, loading: () => <Skeleton className="h-[280px]" /> });
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { date, money } from '@/lib/utils';

type Dashboard = {
  revenue: string; receivables: string; payables: string;
  invoices: { outstanding: number; paid: number; partiallyPaid: number; overdue: number; draft: number };
  counts: { customers: number | null; vendors: number | null; employees: number | null; services: number };
  monthly: { month: string; invoiced: string; collected: string }[];
  recent: { id: Id; invoiceNumber: string | null; status: string; total: string; direction: string; party?: string; createdAt: string }[];
  upcoming: { id: Id; invoiceId: Id; invoiceNumber: string | null; direction: string; party?: string; stageNumber: number; dueDate: string; balance: string; status: string }[];
};

export default function DashboardPage() {
  const { companyId, serviceId, ctx, me, can } = useSession();
  const q = useQuery({ queryKey: ['dashboard', companyId, serviceId], queryFn: () => api<Dashboard>('/dashboard') });
  const d = q.data;
  const hour = new Date().getHours();

  return (
    <>
      <PageHeader
        title={`Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, ${me.fullName.split(' ')[0]}`}
        description={ctx ? `${ctx.company.displayName}${ctx.company.plan ? ` · ${ctx.company.plan.name} plan` : ''}` : undefined}
        actions={can('invoice.create') && <Link href="/app/invoices/new" className={buttonClass()}><Plus className="size-4" /> New invoice</Link>}
      />
      {q.isError ? <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card> : !d ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy>{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Collected (all time)" value={money(d.revenue)} icon={<IndianRupee className="size-4" />} />
            <Stat label="Receivables" value={money(d.receivables)} hint={`${d.invoices.outstanding} open invoice${d.invoices.outstanding === 1 ? '' : 's'}`} icon={<ArrowDownLeft className="size-4" />} />
            <Stat label="Payables" value={money(d.payables)} icon={<ArrowUpRight className="size-4" />} />
            <Stat label="Overdue invoices" value={d.invoices.overdue} hint={`${d.invoices.draft} drafts · ${d.invoices.paid} paid`} icon={<AlertTriangle className="size-4" />} />
          </div>
          <Card>
            <CardHeader title="Invoiced vs collected" description="Last 12 months, receivables only" />
            <div className="p-4">{d.monthly.length ? <RevenueChart data={d.monthly} /> : <Empty title="No data yet" />}</div>
          </Card>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Upcoming dues" description="Open payment stages by due date" />
              {d.upcoming.length === 0 ? <Empty title="Nothing due" /> : (
                <ul className="divide-y">
                  {d.upcoming.map((u) => (
                    <li key={u.id}>
                      <Link href={`/app/invoices/${u.invoiceId}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-muted/60">
                        <div>
                          <p className="font-medium">{u.invoiceNumber} · Stage {u.stageNumber}</p>
                          <p className="text-fg-muted">{u.party} · due {date(u.dueDate)}</p>
                        </div>
                        <div className="text-right"><p className="num font-medium">{money(u.balance)}</p><Badge value={u.status} /></div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title="Recent invoices" />
              {d.recent.length === 0 ? <Empty title="No invoices yet" /> : (
                <ul className="divide-y">
                  {d.recent.map((r) => (
                    <li key={r.id}>
                      <Link href={`/app/invoices/${r.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-muted/60">
                        <div>
                          <p className="font-medium">{r.invoiceNumber ?? 'Draft'}</p>
                          <p className="text-fg-muted">{r.party ?? '—'} · {date(r.createdAt)}</p>
                        </div>
                        <div className="text-right"><p className="num font-medium">{money(r.total)}</p><Badge value={r.status} /></div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
