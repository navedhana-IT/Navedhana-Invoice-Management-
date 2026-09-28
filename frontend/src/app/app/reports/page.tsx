'use client';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Download } from 'lucide-react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DataTable, PageHeader, type Column } from '@/components/data';
import { Button, Card, Empty, ErrorState, Field, Input, Skeleton, Stat, Tabs } from '@/components/ui';
import type { Id } from '@/lib/ids';

const RevenueChart = dynamic(() => import('@/features/dashboard/revenue-chart').then((m) => m.RevenueChart), { ssr: false, loading: () => <Skeleton className="h-[280px]" /> });
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { date, money, titleCase } from '@/lib/utils';

// Each report type returns a different row shape; the column definitions below are the contract.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>;
const REPORTS = ['sales', 'purchases', 'receivables', 'payables', 'outstanding', 'payments', 'tax', 'revenue', 'by-service', 'employees'] as const;
type Report = (typeof REPORTS)[number];

const invoiceCols: Column<AnyRow & { id: Id }>[] = [
  { key: 'no', header: 'Number', cell: (r) => <span className="font-medium">{r.invoiceNumber}</span> },
  { key: 'party', header: 'Party', cell: (r) => r.party ?? '—' },
  { key: 'service', header: 'Brand', cell: (r) => r.service },
  { key: 'date', header: 'Date', cell: (r) => date(r.issueDate) },
  { key: 'total', header: 'Total', align: 'right', cell: (r) => money(r.total) },
  { key: 'bal', header: 'Balance', align: 'right', cell: (r) => money(r.balanceAmount) },
  { key: 'od', header: 'Days overdue', align: 'right', cell: (r) => r.daysOverdue || '—' },
];

const COLUMNS: Partial<Record<Report, Column<AnyRow & { id: Id }>[]>> = {
  payments: [
    { key: 'date', header: 'Date', cell: (r) => date(r.paidAt) },
    { key: 'inv', header: 'Invoice', cell: (r) => r.invoice?.invoiceNumber },
    { key: 'party', header: 'Party', cell: (r) => r.party ?? '—' },
    { key: 'method', header: 'Method', cell: (r) => titleCase(r.method) },
    { key: 'status', header: 'Status', cell: (r) => titleCase(r.status) },
    { key: 'amount', header: 'Amount', align: 'right', cell: (r) => money(r.amount) },
  ],
  tax: [
    { key: 'month', header: 'Month', cell: (r) => new Date(r.month).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' }) },
    { key: 'dir', header: 'Type', cell: (r) => (r.direction === 'RECEIVABLE' ? 'Output (sales)' : 'Input (purchases)') },
    { key: 'taxable', header: 'Taxable', align: 'right', cell: (r) => money(r.taxable) },
    { key: 'cgst', header: 'CGST', align: 'right', cell: (r) => money(r.cgst) },
    { key: 'sgst', header: 'SGST', align: 'right', cell: (r) => money(r.sgst) },
    { key: 'igst', header: 'IGST', align: 'right', cell: (r) => money(r.igst) },
  ],
  revenue: [
    { key: 'month', header: 'Month', cell: (r) => new Date(r.month).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' }) },
    { key: 'inv', header: 'Invoiced', align: 'right', cell: (r) => money(r.invoiced) },
    { key: 'col', header: 'Collected', align: 'right', cell: (r) => money(r.collected) },
  ],
  'by-service': [
    { key: 'service', header: 'Brand', cell: (r) => <span className="font-medium">{r.service}</span> },
    { key: 'dir', header: 'Direction', cell: (r) => titleCase(r.direction) },
    { key: 'count', header: 'Invoices', align: 'right', cell: (r) => r.count },
    { key: 'total', header: 'Total', align: 'right', cell: (r) => money(r.total) },
    { key: 'paid', header: 'Paid', align: 'right', cell: (r) => money(r.paid) },
    { key: 'bal', header: 'Balance', align: 'right', cell: (r) => money(r.balance) },
  ],
  employees: [
    { key: 'dept', header: 'Department', cell: (r) => r.department },
    { key: 'status', header: 'Status', cell: (r) => titleCase(r.status) },
    { key: 'count', header: 'Employees', align: 'right', cell: (r) => r.count },
  ],
};

export default function ReportsPage() {
  const { companyId, serviceId } = useSession();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const type = (REPORTS as readonly string[]).includes(params.get('type') ?? '') ? (params.get('type') as Report) : 'sales';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const setParam = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) if (v) next.set(k, v); else next.delete(k);
    router.replace(`${pathname}?${next}`, { scroll: false });
  };
  const q = useQuery({
    queryKey: ['report', type, from, to, companyId, serviceId],
    queryFn: () => api<AnyRow>(`/reports/${type}`, { query: { from, to } }),
  });
  const data = q.data;

  const rows: AnyRow[] = (Array.isArray(data) ? data : data?.rows ?? []).map((r: AnyRow, i: number) => ({ id: r.id ?? String(i), ...r }));
  const cols = COLUMNS[type] ?? invoiceCols;

  return (
    <>
      <PageHeader title="Reports" description="Computed on the server from stored invoice totals. Proforma invoices are excluded."
        actions={<Button variant="secondary" disabled={!rows.length} onClick={() => downloadCsv(`${type}-report${from ? `-${from}` : ''}${to ? `-to-${to}` : ''}.csv`, rows)}><Download className="size-4" /> Export CSV</Button>} />
      <Tabs value={type} onValueChange={(v) => setParam({ type: v === 'sales' ? '' : v })} tabs={REPORTS.map((r) => ({ value: r, label: titleCase(r.replace('-', '_')) }))} className="mb-4" />
      {type !== 'employees' && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
          <Field label="From"><Input type="date" value={from} max={to || undefined} onChange={(e) => setParam({ from: e.target.value })} /></Field>
          <Field label="To"><Input type="date" value={to} min={from || undefined} onChange={(e) => setParam({ to: e.target.value })} /></Field>
        </div>
      )}
      {q.isError ? <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card> : q.isLoading ? <Skeleton className="h-64" /> : (
        <div className="space-y-6">
          {data?.summary && !Array.isArray(data.summary) && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Invoices" value={data.summary.count} />
              <Stat label="Total" value={money(data.summary.total)} hint={`GST ${money(data.summary.tax)}`} />
              <Stat label="Paid" value={money(data.summary.paid)} />
              <Stat label="Balance" value={money(data.summary.balance)} />
            </div>
          )}
          {Array.isArray(data?.summary) && (
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">{data.summary.map((m: AnyRow) => <Stat key={m.method} label={titleCase(m.method)} value={money(m.amount)} hint={`${m.count} payments`} />)}</div>
          )}
          {data?.aging && (
            <Card className="grid grid-cols-2 divide-x p-0 sm:grid-cols-5">
              {Object.entries(data.aging as Record<string, string>).map(([k, v]) => (
                <div key={k} className="p-4"><p className="text-xs text-fg-muted">{{ current: 'Not due', d1_30: '1–30 days', d31_60: '31–60 days', d61_90: '61–90 days', d90_plus: '90+ days' }[k]}</p><p className="num mt-1 font-semibold">{money(v)}</p></div>
              ))}
            </Card>
          )}
          {type === 'revenue' && rows.length > 0 && <Card className="p-4"><RevenueChart data={[...rows].reverse() as never} /></Card>}
          <Card><DataTable columns={cols} rows={rows as (AnyRow & { id: Id })[]} empty={<Empty icon={<BarChart3 className="size-5" />} title="No data for this period" description="Try widening the date range or picking another brand." />} /></Card>
        </div>
      )}
    </>
  );
}

function downloadCsv(name: string, rows: AnyRow[]) {
  const flat = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v === null || typeof v !== 'object' || v instanceof Date)));
  const keys = [...new Set(flat.flatMap(Object.keys))];
  // Prefix formula-leading cells so spreadsheets never evaluate exported text as a formula.
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return `"${(/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  };
  const csv = [keys.map(esc).join(','), ...flat.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
