'use client';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Percent,
  ReceiptIndianRupee,
  RotateCcw,
  Search,
  TrendingUp,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { DataTable, PageHeader, type Column } from '@/components/data';
import { Button, Card, Empty, ErrorState, Input, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import type { Id } from '@/lib/ids';
import { useSession } from '@/lib/session';
import { cn, date, money, titleCase } from '@/lib/utils';

const RevenueChart = dynamic(() => import('@/features/dashboard/revenue-chart').then((m) => m.RevenueChart), {
  ssr: false,
  loading: () => <Skeleton className="h-[280px]" />,
});

// Each report type returns a different row shape; the column definitions below are the contract.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>;

const REPORTS = ['sales', 'purchases', 'receivables', 'payables', 'outstanding', 'payments', 'tax', 'revenue', 'by-service', 'employees'] as const;
type Report = (typeof REPORTS)[number];

type ReportCategory = 'Invoicing' | 'Finance & Tax' | 'Insights';

type ReportMeta = {
  id: Report;
  label: string;
  category: ReportCategory;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
};

const REPORT_META: ReportMeta[] = [
  { id: 'sales', label: 'Sales Invoices', category: 'Invoicing', description: 'Customer invoices, total billed amounts and collection status', icon: FileText },
  { id: 'purchases', label: 'Purchase Bills', category: 'Invoicing', description: 'Vendor bills received, expenses and payable balances', icon: ReceiptIndianRupee },
  { id: 'receivables', label: 'Receivables', category: 'Invoicing', description: 'Uncollected customer balances with age analysis', icon: ArrowDownLeft },
  { id: 'payables', label: 'Payables', category: 'Invoicing', description: 'Pending vendor payments and upcoming obligations', icon: ArrowUpRight },
  { id: 'outstanding', label: 'Overdue Dues', category: 'Invoicing', description: 'Invoices that have passed their designated payment due date', icon: AlertCircle },
  { id: 'payments', label: 'Payments', category: 'Finance & Tax', description: 'Transaction history and payment method breakdown', icon: Wallet },
  { id: 'tax', label: 'GST Tax Summary', category: 'Finance & Tax', description: 'Output CGST/SGST/IGST vs Input tax credit breakdown', icon: Percent },
  { id: 'revenue', label: 'Revenue Trends', category: 'Finance & Tax', description: 'Monthly invoiced vs collected revenue comparisons', icon: TrendingUp },
  { id: 'by-service', label: 'Brand Performance', category: 'Insights', description: 'Revenue and collection performance across individual brands', icon: Building2 },
  { id: 'employees', label: 'Team Headcount', category: 'Insights', description: 'Staff distribution and employment status by department', icon: Users },
];

const invoiceCols: Column<AnyRow & { id: Id }>[] = [
  { key: 'no', header: 'Number', cell: (r) => <span className="font-semibold text-fg">{r.invoiceNumber ?? 'Draft'}</span> },
  { key: 'party', header: 'Party', cell: (r) => <span className="font-medium text-fg">{r.party ?? '—'}</span> },
  { key: 'service', header: 'Brand', cell: (r) => <span className="inline-flex items-center rounded-md bg-bg-muted px-2 py-0.5 text-xs font-medium text-fg-muted">{r.service}</span> },
  { key: 'date', header: 'Date', cell: (r) => <span className="text-sm text-fg-muted">{date(r.issueDate)}</span> },
  { key: 'total', header: 'Total', align: 'right', cell: (r) => <span className="font-mono text-sm font-semibold">{money(r.total)}</span> },
  { key: 'bal', header: 'Balance', align: 'right', cell: (r) => Number(r.balanceAmount) > 0 ? <span className="font-mono text-sm font-semibold text-danger">{money(r.balanceAmount)}</span> : <span className="font-mono text-sm text-fg-muted">₹0.00</span> },
  { key: 'od', header: 'Days overdue', align: 'right', cell: (r) => Number(r.daysOverdue) > 0 ? <span className="inline-flex items-center rounded-full bg-danger-soft px-2 py-0.5 font-mono text-xs font-semibold text-danger">{r.daysOverdue}d</span> : <span className="text-xs text-fg-muted">—</span> },
];

const COLUMNS: Partial<Record<Report, Column<AnyRow & { id: Id }>[]>> = {
  payments: [
    { key: 'date', header: 'Date', cell: (r) => <span className="text-sm text-fg-muted">{date(r.paidAt)}</span> },
    { key: 'inv', header: 'Invoice', cell: (r) => <span className="font-medium text-fg">{r.invoice?.invoiceNumber ?? '—'}</span> },
    { key: 'party', header: 'Party', cell: (r) => <span className="text-sm">{r.party ?? '—'}</span> },
    { key: 'method', header: 'Method', cell: (r) => <span className="inline-flex items-center rounded-md bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">{titleCase(r.method)}</span> },
    { key: 'status', header: 'Status', cell: (r) => <span className="inline-flex items-center rounded-md bg-success-soft px-2 py-0.5 text-xs font-medium text-success">{titleCase(r.status)}</span> },
    { key: 'amount', header: 'Amount', align: 'right', cell: (r) => <span className="font-mono text-sm font-bold text-fg">{money(r.amount)}</span> },
  ],
  tax: [
    { key: 'month', header: 'Month', cell: (r) => <span className="font-medium text-fg">{new Date(r.month).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })}</span> },
    { key: 'dir', header: 'Type', cell: (r) => <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', r.direction === 'RECEIVABLE' ? 'bg-primary-soft text-primary' : 'bg-warning-soft text-warning')}>{r.direction === 'RECEIVABLE' ? 'Output (sales)' : 'Input (purchases)'}</span> },
    { key: 'taxable', header: 'Taxable value', align: 'right', cell: (r) => <span className="font-mono text-sm">{money(r.taxable)}</span> },
    { key: 'cgst', header: 'CGST', align: 'right', cell: (r) => <span className="font-mono text-sm text-fg-muted">{money(r.cgst)}</span> },
    { key: 'sgst', header: 'SGST', align: 'right', cell: (r) => <span className="font-mono text-sm text-fg-muted">{money(r.sgst)}</span> },
    { key: 'igst', header: 'IGST', align: 'right', cell: (r) => <span className="font-mono text-sm text-fg-muted">{money(r.igst)}</span> },
  ],
  revenue: [
    { key: 'month', header: 'Month', cell: (r) => <span className="font-medium text-fg">{new Date(r.month).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</span> },
    { key: 'inv', header: 'Invoiced', align: 'right', cell: (r) => <span className="font-mono text-sm font-semibold text-primary">{money(r.invoiced)}</span> },
    { key: 'col', header: 'Collected', align: 'right', cell: (r) => <span className="font-mono text-sm font-semibold text-success">{money(r.collected)}</span> },
  ],
  'by-service': [
    { key: 'service', header: 'Brand', cell: (r) => <span className="font-semibold text-fg">{r.service}</span> },
    { key: 'dir', header: 'Direction', cell: (r) => <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', r.direction === 'RECEIVABLE' ? 'bg-primary-soft text-primary' : 'bg-warning-soft text-warning')}>{titleCase(r.direction)}</span> },
    { key: 'count', header: 'Invoices', align: 'right', cell: (r) => <span className="font-mono text-sm text-fg-muted">{r.count}</span> },
    { key: 'total', header: 'Total', align: 'right', cell: (r) => <span className="font-mono text-sm font-semibold">{money(r.total)}</span> },
    { key: 'paid', header: 'Paid', align: 'right', cell: (r) => <span className="font-mono text-sm text-success">{money(r.paid)}</span> },
    { key: 'bal', header: 'Balance', align: 'right', cell: (r) => Number(r.balance) > 0 ? <span className="font-mono text-sm text-danger">{money(r.balance)}</span> : <span className="font-mono text-sm text-fg-muted">₹0.00</span> },
  ],
  employees: [
    { key: 'dept', header: 'Department', cell: (r) => <span className="font-semibold text-fg">{r.department}</span> },
    { key: 'status', header: 'Status', cell: (r) => <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', r.status === 'ACTIVE' ? 'bg-success-soft text-success' : 'bg-bg-muted text-fg-muted')}>{titleCase(r.status)}</span> },
    { key: 'count', header: 'Employees', align: 'right', cell: (r) => <span className="font-mono text-sm font-bold">{r.count}</span> },
  ],
};

function getDatePresets() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const thisMonthFrom = fmt(new Date(year, month, 1));
  const todayStr = fmt(now);

  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const last30From = fmt(last30);

  const qMonth = Math.floor(month / 3) * 3;
  const thisQuarterFrom = fmt(new Date(year, qMonth, 1));

  const fyYear = month >= 3 ? year : year - 1;
  const thisFYFrom = `${fyYear}-04-01`;

  return [
    { label: 'This Month', from: thisMonthFrom, to: todayStr },
    { label: 'Last 30 Days', from: last30From, to: todayStr },
    { label: 'This Quarter', from: thisQuarterFrom, to: todayStr },
    { label: 'This FY', from: thisFYFrom, to: todayStr },
  ];
}

export default function ReportsPage() {
  const { companyId, serviceId } = useSession();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const type = (REPORTS as readonly string[]).includes(params.get('type') ?? '')
    ? (params.get('type') as Report)
    : 'sales';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';

  const [activeCategory, setActiveCategory] = useState<ReportCategory | 'All'>('All');
  const [filterQuery, setFilterQuery] = useState('');

  const currentMeta = REPORT_META.find((m) => m.id === type) ?? REPORT_META[0];
  const IconComponent = currentMeta.icon;

  const setParam = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  const q = useQuery({
    queryKey: ['report', type, from, to, companyId, serviceId],
    queryFn: () => api<AnyRow>(`/reports/${type}`, { query: { from, to } }),
  });
  const data = q.data;

  const rawRows: AnyRow[] = (Array.isArray(data) ? data : data?.rows ?? []).map((r: AnyRow, i: number) => ({
    id: r.id ?? String(i),
    ...r,
  }));

  // In-memory fast filter on table rows
  const rows = useMemo(() => {
    if (!filterQuery.trim()) return rawRows;
    const term = filterQuery.toLowerCase();
    return rawRows.filter((r) =>
      Object.values(r).some((v) => typeof v === 'string' && v.toLowerCase().includes(term))
    );
  }, [rawRows, filterQuery]);

  const cols = COLUMNS[type] ?? invoiceCols;
  const presets = useMemo(() => getDatePresets(), []);

  // Check which preset is active
  const activePreset = presets.find((p) => p.from === from && p.to === to)?.label;

  const filteredReports = activeCategory === 'All'
    ? REPORT_META
    : REPORT_META.filter((m) => m.category === activeCategory);

  // Calculate aging statistics if available
  const agingTotal = useMemo(() => {
    if (!data?.aging) return 0;
    return Object.values(data.aging as Record<string, string>).reduce((acc, v) => acc + Number(v || 0), 0);
  }, [data?.aging]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Reports & Analytics"
        description="Authoritative financial, tax, and operational metrics computed from stored records."
        actions={
          <Button
            variant="secondary"
            disabled={!rawRows.length}
            onClick={() =>
              downloadCsv(
                `${type}-report${from ? `-${from}` : ''}${to ? `-to-${to}` : ''}.csv`,
                rawRows
              )
            }
          >
            <Download className="size-4" /> Export CSV ({rawRows.length})
          </Button>
        }
      />

      {/* Report Selection Area */}
      <Card className="p-4 sm:p-5 space-y-4">
        {/* Category Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(['All', 'Invoicing', 'Finance & Tax', 'Insights'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                  activeCategory === cat
                    ? 'bg-primary text-primary-fg shadow-xs'
                    : 'text-fg-muted hover:bg-bg-alt hover:text-fg'
                )}
              >
                {cat}
              </button>
            ))}
          </div>
          <span className="text-xs text-fg-muted hidden sm:inline">
            Choose a report below to view real-time data
          </span>
        </div>

        {/* Report Cards Grid */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {filteredReports.map((r) => {
            const ItemIcon = r.icon;
            const isSelected = r.id === type;

            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setParam({ type: r.id === 'sales' ? '' : r.id })}
                className={cn(
                  'group flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all',
                  isSelected
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs'
                    : 'border-border bg-surface hover:border-border-strong hover:bg-bg-alt/50'
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <div
                    className={cn(
                      'flex size-7 items-center justify-center rounded-lg transition-colors',
                      isSelected ? 'bg-primary text-primary-fg' : 'bg-bg-muted text-fg-muted group-hover:text-fg'
                    )}
                  >
                    <ItemIcon className="size-3.5" />
                  </div>
                  {isSelected && (
                    <span className="size-2 rounded-full bg-primary animate-pulse" />
                  )}
                </div>
                <div className="mt-1">
                  <span className={cn('text-xs font-semibold block leading-tight', isSelected ? 'text-primary' : 'text-fg')}>
                    {r.label}
                  </span>
                  <span className="text-[10px] text-fg-muted line-clamp-1 mt-0.5">
                    {r.category}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Date Filter Toolbar (for reports that accept date filtering) */}
      {type !== 'employees' && (
        <Card className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted mr-1">
                Period:
              </span>
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setParam({ from: preset.from, to: preset.to })}
                  className={cn(
                    'rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors border',
                    activePreset === preset.label
                      ? 'border-primary bg-primary-soft text-primary font-semibold'
                      : 'border-border bg-surface text-fg-muted hover:bg-bg-alt hover:text-fg'
                  )}
                >
                  {preset.label}
                </button>
              ))}
              {(from || to) && (
                <button
                  type="button"
                  onClick={() => setParam({ from: '', to: '' })}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-danger hover:bg-danger-soft transition-colors"
                  title="Clear date range"
                >
                  <RotateCcw className="size-3" />
                  <span>All time</span>
                </button>
              )}
            </div>

            {/* Custom Date Pickers */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Input
                    type="date"
                    value={from}
                    max={to || undefined}
                    onChange={(e) => setParam({ from: e.target.value })}
                    className="h-8.5 w-36 text-xs"
                    title="From date"
                  />
                </div>
                <span className="text-xs text-fg-muted font-medium">to</span>
                <div className="relative">
                  <Input
                    type="date"
                    value={to}
                    min={from || undefined}
                    onChange={(e) => setParam({ to: e.target.value })}
                    className="h-8.5 w-36 text-xs"
                    title="To date"
                  />
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Error / Loading / Content */}
      {q.isError ? (
        <Card className="p-6">
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Card>
      ) : q.isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active Report Header Banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <IconComponent className="size-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight text-fg">
                  {currentMeta.label}
                </h2>
                <p className="text-xs text-fg-muted">
                  {currentMeta.description}
                  {from || to ? (
                    <span className="ml-1 text-primary font-medium">
                      · ({from ? date(from) : 'Start'} – {to ? date(to) : 'Today'})
                    </span>
                  ) : null}
                </p>
              </div>
            </div>
          </div>

          {/* Metric KPI Cards (Invoice Summary) */}
          {data?.summary && !Array.isArray(data.summary) && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="p-4 sm:p-5 border-l-4 border-l-primary hover:shadow-xs transition-shadow">
                <div className="flex items-center justify-between text-sm text-fg-muted">
                  <span>Total Billed</span>
                  <div className="rounded-lg bg-primary-soft p-1.5 text-primary">
                    <FileText className="size-4" />
                  </div>
                </div>
                <div className="font-mono text-xl font-bold tracking-tight sm:text-2xl mt-2 text-fg">
                  {money(data.summary.total)}
                </div>
                <div className="mt-1 text-xs text-fg-muted">
                  GST: <span className="font-mono font-medium text-fg">{money(data.summary.tax)}</span>
                </div>
              </Card>

              <Card className="p-4 sm:p-5 border-l-4 border-l-success hover:shadow-xs transition-shadow">
                <div className="flex items-center justify-between text-sm text-fg-muted">
                  <span>Total Paid</span>
                  <div className="rounded-lg bg-success-soft p-1.5 text-success">
                    <CheckCircle2 className="size-4" />
                  </div>
                </div>
                <div className="font-mono text-xl font-bold tracking-tight sm:text-2xl mt-2 text-success">
                  {money(data.summary.paid)}
                </div>
                <div className="mt-1 text-xs text-fg-muted">
                  {Number(data.summary.total) > 0
                    ? `${((Number(data.summary.paid) / Number(data.summary.total)) * 100).toFixed(0)}% collected`
                    : '100% settled'}
                </div>
              </Card>

              <Card className="p-4 sm:p-5 border-l-4 border-l-warning hover:shadow-xs transition-shadow">
                <div className="flex items-center justify-between text-sm text-fg-muted">
                  <span>Outstanding Balance</span>
                  <div className="rounded-lg bg-warning-soft p-1.5 text-warning">
                    <Clock className="size-4" />
                  </div>
                </div>
                <div className={cn('font-mono text-xl font-bold tracking-tight sm:text-2xl mt-2', Number(data.summary.balance) > 0 ? 'text-warning' : 'text-fg')}>
                  {money(data.summary.balance)}
                </div>
                <div className="mt-1 text-xs text-fg-muted">
                  {Number(data.summary.total) > 0
                    ? `${((Number(data.summary.balance) / Number(data.summary.total)) * 100).toFixed(0)}% pending`
                    : 'No pending dues'}
                </div>
              </Card>

              <Card className="p-4 sm:p-5 border-l-4 border-l-border-strong hover:shadow-xs transition-shadow">
                <div className="flex items-center justify-between text-sm text-fg-muted">
                  <span>Total Count</span>
                  <div className="rounded-lg bg-bg-muted p-1.5 text-fg-muted">
                    <TrendingUp className="size-4" />
                  </div>
                </div>
                <div className="font-mono text-xl font-bold tracking-tight sm:text-2xl mt-2 text-fg">
                  {data.summary.count}
                </div>
                <div className="mt-1 text-xs text-fg-muted">
                  Records in selected period
                </div>
              </Card>
            </div>
          )}

          {/* Payment Methods Breakdown Cards */}
          {Array.isArray(data?.summary) && (
            <Card className="p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-fg">Payment Methods Breakdown</h3>
                <span className="text-xs text-fg-muted">By collection channel</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {data.summary.map((m: AnyRow) => (
                  <div
                    key={m.method}
                    className="rounded-xl border border-border bg-bg-alt/30 p-3 flex flex-col justify-between"
                  >
                    <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
                      {titleCase(m.method)}
                    </span>
                    <div className="my-1.5 font-mono text-lg font-bold text-fg">
                      {money(m.amount)}
                    </div>
                    <span className="text-[11px] text-fg-muted">
                      {m.count} {Number(m.count) === 1 ? 'payment' : 'payments'}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Aging Analysis Ladder */}
          {data?.aging && (
            <Card className="p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                <div>
                  <h3 className="text-sm font-semibold text-fg">Overdue Aging Analysis</h3>
                  <p className="text-xs text-fg-muted">Chronological distribution of uncollected balance</p>
                </div>
                <div className="font-mono text-sm font-bold text-fg">
                  Total Pending: {money(agingTotal)}
                </div>
              </div>

              {/* Visual Proportion Bar */}
              {agingTotal > 0 && (
                <div className="h-2 w-full overflow-hidden rounded-full bg-bg-muted flex">
                  {Object.entries(data.aging as Record<string, string>).map(([k, v]) => {
                    const amt = Number(v || 0);
                    if (amt <= 0) return null;
                    const pct = Math.max(2, (amt / agingTotal) * 100);
                    const color =
                      k === 'current'
                        ? 'bg-emerald-500'
                        : k === 'd1_30'
                        ? 'bg-sky-500'
                        : k === 'd31_60'
                        ? 'bg-amber-500'
                        : k === 'd61_90'
                        ? 'bg-orange-500'
                        : 'bg-rose-500';
                    return <div key={k} style={{ width: `${pct}%` }} className={cn('h-full', color)} />;
                  })}
                </div>
              )}

              {/* Bucket Grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  { key: 'current', label: 'Not due', color: 'bg-emerald-500' },
                  { key: 'd1_30', label: '1–30 days', color: 'bg-sky-500' },
                  { key: 'd31_60', label: '31–60 days', color: 'bg-amber-500' },
                  { key: 'd61_90', label: '61–90 days', color: 'bg-orange-500' },
                  { key: 'd90_plus', label: '90+ days', color: 'bg-rose-500' },
                ].map(({ key, label, color }) => {
                  const val = (data.aging as Record<string, string>)[key] ?? '0';
                  return (
                    <div
                      key={key}
                      className="rounded-xl border border-border/80 bg-bg-alt/20 p-3"
                    >
                      <div className="flex items-center gap-1.5 text-xs text-fg-muted">
                        <span className={cn('size-2 rounded-full', color)} />
                        <span>{label}</span>
                      </div>
                      <div className="font-mono text-base font-bold text-fg mt-1.5">
                        {money(val)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Revenue Chart Section */}
          {type === 'revenue' && rawRows.length > 0 && (
            <Card className="p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                <div>
                  <h3 className="text-sm font-semibold text-fg">Monthly Revenue & Collection Velocity</h3>
                  <p className="text-xs text-fg-muted">Invoiced amounts vs cash collected over time</p>
                </div>
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <div className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-[#6366f1]" />
                    <span className="text-fg-muted">Invoiced</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-[#10b981]" />
                    <span className="text-fg-muted">Collected</span>
                  </div>
                </div>
              </div>
              <RevenueChart data={[...rawRows].reverse() as never} />
            </Card>
          )}

          {/* Data Table Section */}
          <Card className="overflow-hidden">
            {/* Table Header with Quick Search */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3.5 sm:px-5">
              <div className="flex items-center gap-2.5">
                <h3 className="font-semibold text-sm sm:text-base text-fg">Report Entries</h3>
                <span className="inline-flex items-center rounded-full bg-bg-muted px-2.5 py-0.5 font-mono text-xs font-semibold text-fg-muted">
                  {rows.length} {rows.length === 1 ? 'row' : 'rows'}
                </span>
              </div>

              {rawRows.length > 3 && (
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-fg-muted" />
                  <Input
                    type="text"
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    placeholder="Search in table…"
                    className="h-8 pl-8 pr-7 text-xs"
                  />
                  {filterQuery && (
                    <button
                      type="button"
                      onClick={() => setFilterQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>
              )}
            </div>

            <DataTable
              columns={cols}
              rows={rows as (AnyRow & { id: Id })[]}
              empty={
                <Empty
                  icon={<BarChart3 className="size-6 text-fg-muted" />}
                  title="No records found"
                  description={
                    filterQuery
                      ? 'No items matched your search filter.'
                      : 'Try widening the date range or selecting another report.'
                  }
                />
              }
            />
          </Card>
        </div>
      )}
    </div>
  );
}

function downloadCsv(name: string, rows: AnyRow[]) {
  const flat = rows.map((r) =>
    Object.fromEntries(
      Object.entries(r).filter(([, v]) => v === null || typeof v !== 'object' || v instanceof Date)
    )
  );
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
