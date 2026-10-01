'use client';
import { ReceiptIndianRupee, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { DateRangeFilter, FilterSelect, ListCard, PageHeader, useList } from '@/components/data';
import { Badge, Button, Empty } from '@/components/ui';
import { openBlob } from '@/lib/api';
import { useSession } from '@/lib/session';
import { date, money, titleCase } from '@/lib/utils';
import type { Id } from '@/lib/ids';

type PaymentRow = {
  id: Id; receiptNumber: string | null; amount: string; method: string; status: string; paidAt: string; reference: string | null;
  invoice: { id: Id; invoiceNumber: string | null; externalNumber: string | null; direction: 'RECEIVABLE' | 'PAYABLE'; currency: string; customer: { name: string } | null; vendor: { name: string } | null };
};

const METHODS = ['CASH', 'BANK_TRANSFER', 'UPI', 'CARD', 'CHEQUE', 'OTHER'];

export default function PaymentsPage() {
  const router = useRouter();
  const { ctx, serviceId } = useSession();
  const brands = ctx?.services ?? [];
  const list = useList<PaymentRow>('/payments', { filters: ['direction', 'method', 'status', 'serviceId', 'from', 'to'], sort: 'paidAt:desc' });
  const summary = (list.data as { summary?: { successTotal: string } } | undefined)?.summary;
  const pdf = (id: Id) => openBlob(`/payments/${id}/pdf`).catch((e: Error) => toast.error(e.message));

  return (
    <>
      <PageHeader
        title="Payments"
        description="Money received from customers and paid to vendors, across your brands."
        actions={summary && <div className="rounded-lg border bg-surface px-3 py-1.5 text-sm"><span className="text-fg-muted">Successful total </span><span className="font-semibold tabular-nums">{money(summary.successTotal)}</span></div>}
      />
      <ListCard
        list={list}
        onRowClick={(r) => router.push(`/app/invoices/${r.invoice.id}`)}
        rowLabel={(r) => `Open invoice for payment ${r.receiptNumber ?? ''}`}
        searchPlaceholder="Search receipt, reference, invoice or party…"
        toolbar={
          <>
            <FilterSelect list={list} name="direction" label="Type" options={[{ value: 'RECEIVABLE', label: 'Received (receipts)' }, { value: 'PAYABLE', label: 'Paid (vouchers)' }]} />
            <FilterSelect list={list} name="method" label="Method" options={METHODS.map((m) => ({ value: m, label: titleCase(m) }))} />
            <FilterSelect list={list} name="status" label="Status" options={['SUCCESS', 'FAILED', 'REFUNDED', 'REVERSED'].map((s) => ({ value: s, label: titleCase(s) }))} />
            {!serviceId && brands.length > 1 && <FilterSelect list={list} name="serviceId" label="Brand" options={brands.map((b) => ({ value: String(b.id), label: b.displayName ?? b.name }))} />}
            <DateRangeFilter list={list} label="Paid on" />
          </>
        }
        empty={<Empty icon={<Wallet className="size-5" />} title="No payments yet" description="Payments you record on invoices and bills show up here." />}
        columns={[
          { key: 'no', header: 'Receipt / voucher', primary: true, cell: (r) => <span className="font-medium">{r.receiptNumber ?? '—'}</span> },
          { key: 'date', header: 'Paid on', sort: 'paidAt', cell: (r) => date(r.paidAt) },
          { key: 'party', header: 'Party', cell: (r) => <span className="block max-w-56 truncate">{r.invoice.customer?.name ?? r.invoice.vendor?.name ?? '—'}</span> },
          { key: 'inv', header: 'Invoice', hideOnMobile: true, cell: (r) => <span className="text-fg-muted">{r.invoice.invoiceNumber ?? r.invoice.externalNumber ?? 'Draft'}</span> },
          { key: 'dir', header: 'Type', hideOnMobile: true, cell: (r) => <span className={r.invoice.direction === 'RECEIVABLE' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}>{r.invoice.direction === 'RECEIVABLE' ? 'Received' : 'Paid'}</span> },
          { key: 'method', header: 'Method', hideOnMobile: true, cell: (r) => titleCase(r.method) },
          { key: 'amount', header: 'Amount', sort: 'amount', align: 'right', cell: (r) => money(r.amount) },
          { key: 'status', header: 'Status', cell: (r) => <Badge value={r.status} /> },
          {
            key: 'pdf', header: 'PDF',
            cell: (r) => r.receiptNumber && r.status === 'SUCCESS' && (
              <Button variant="ghost" size="icon-sm" aria-label={`Download ${r.invoice.direction === 'PAYABLE' ? 'voucher' : 'receipt'} ${r.receiptNumber}`} onClick={(e) => { e.stopPropagation(); pdf(r.id); }}>
                <ReceiptIndianRupee className="size-4" />
              </Button>
            ),
          },
        ]}
      />
    </>
  );
}
