'use client';
import { FileText, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DateRangeFilter, FilterSelect, ListCard, PageHeader, useList } from '@/components/data';
import { Badge, buttonClass, Empty } from '@/components/ui';
import { useSession } from '@/lib/session';
import { date, money, titleCase } from '@/lib/utils';
import { partyName, SALES_TYPES, STATUSES, type Direction, type InvoiceRow } from './types';

export function InvoiceList({ direction }: { direction: Direction }) {
  const router = useRouter();
  const { can, ctx, serviceId } = useSession();
  const sales = direction === 'RECEIVABLE';
  const list = useList<InvoiceRow>('/invoices', {
    fixed: { direction },
    filters: ['status', 'payment', 'invoiceType', 'serviceId', 'from', 'to'],
    sort: 'createdAt:desc',
  });
  const newHref = sales ? '/app/invoices/new' : '/app/purchases/new';
  const brands = ctx?.services ?? [];

  return (
    <>
      <PageHeader
        title={sales ? 'Sales invoices' : 'Purchase bills'}
        description={sales ? 'Invoices, proformas and notes you issue to customers.' : 'Bills received from vendors.'}
        actions={can('invoice.create') && <Link href={newHref} className={buttonClass()}><Plus className="size-4" /> {sales ? 'New invoice' : 'Record bill'}</Link>}
      />
      <ListCard
        list={list}
        onRowClick={(r) => router.push(sales ? `/app/invoices/${r.id}` : `/app/purchases/${r.id}`)}
        rowLabel={(r) => `Open ${r.invoiceNumber ?? 'draft'} for ${partyName(r)}`}
        searchPlaceholder={sales ? 'Search number or customer…' : 'Search number, bill no. or vendor…'}
        toolbar={
          <>
            <FilterSelect list={list} name="status" label="Status" options={STATUSES.filter((s) => sales ? s !== 'RECEIVED' : s !== 'ISSUED').map((s) => ({ value: s, label: titleCase(s) }))} />
            <FilterSelect list={list} name="payment" label="Payment" options={[{ value: 'OPEN', label: 'Outstanding' }, { value: 'OVERDUE', label: 'Overdue' }, { value: 'SETTLED', label: 'Settled' }]} />
            {sales && <FilterSelect list={list} name="invoiceType" label="Type" options={SALES_TYPES.map((t) => ({ value: t, label: titleCase(t) }))} />}
            {!serviceId && brands.length > 1 && <FilterSelect list={list} name="serviceId" label="Brand" options={brands.map((b) => ({ value: String(b.id), label: b.displayName ?? b.name }))} />}
            <DateRangeFilter list={list} label="Issue date" />
          </>
        }
        empty={
          <Empty icon={<FileText className="size-5" />} title={sales ? 'No invoices yet' : 'No bills yet'} description="Create your first one to start tracking payments."
            action={can('invoice.create') && <Link href={newHref} className={buttonClass()}><Plus className="size-4" /> {sales ? 'Create invoice' : 'Record bill'}</Link>} />
        }
        columns={[
          { key: 'no', header: 'Number', sort: 'invoiceNumber', primary: true, cell: (r) => <span className="font-medium">{r.invoiceNumber ?? <span className="text-fg-muted">Draft</span>}</span> },
          { key: 'party', header: sales ? 'Customer' : 'Vendor', sort: 'party', cell: (r) => <span className="block max-w-56 truncate">{partyName(r)}</span> },
          { key: 'type', header: 'Type', hideOnMobile: true, cell: (r) => <span className="text-fg-muted">{titleCase(r.invoiceType)}</span> },
          { key: 'brand', header: 'Brand', hideOnMobile: true, cell: (r) => r.service.name },
          { key: 'date', header: 'Date', sort: 'issueDate', cell: (r) => date(r.issueDate) },
          { key: 'total', header: 'Total', sort: 'total', align: 'right', cell: (r) => money(r.total) },
          { key: 'bal', header: 'Balance', sort: 'balanceAmount', align: 'right', cell: (r) => money(r.balanceAmount) },
          { key: 'status', header: 'Status', sort: 'status', cell: (r) => <Badge value={r.status} /> },
        ]}
      />
    </>
  );
}
