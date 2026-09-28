'use client';
import { useQuery } from '@tanstack/react-query';
import { Building2, Rocket } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DateRangeFilter, FilterSelect, ListCard, PageHeader, useList } from '@/components/data';
import { Badge, buttonClass, Empty } from '@/components/ui';
import { api } from '@/lib/api';
import { date } from '@/lib/utils';
import type { Id } from '@/lib/ids';

type Row = {
  id: Id; legalName: string; displayName: string; slug: string; status: string; createdAt: string;
  subscriptionStatus: string; trialEndsAt: string | null; plan: { name: string } | null; _count: { services: number; memberships: number };
};

export default function CompaniesPage() {
  const router = useRouter();
  const list = useList<Row>('/admin/companies', { filters: ['status', 'subscriptionStatus', 'planId', 'from', 'to'] });
  const plans = useQuery({ queryKey: ['/admin/plans'], queryFn: () => api<{ id: Id; name: string }[]>('/admin/plans') });
  return (
    <>
      <PageHeader title="Companies" description="Tenants on the platform."
        actions={<Link href="/admin/onboarding" className={buttonClass()}><Rocket className="size-4" /> Onboard company</Link>} />
      <ListCard
        list={list}
        onRowClick={(r) => router.push(`/admin/companies/${r.id}`)}
        rowLabel={(r) => `Open ${r.displayName}`}
        searchPlaceholder="Search name, email or GSTIN…"
        toolbar={
          <>
            <FilterSelect list={list} name="status" label="Status" options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'PENDING', label: 'Pending' }, { value: 'INACTIVE', label: 'Inactive' }]} />
            <FilterSelect list={list} name="subscriptionStatus" label="Billing" options={[{ value: 'TRIALING', label: 'Trialing' }, { value: 'ACTIVE', label: 'Paid' }, { value: 'PAST_DUE', label: 'Past due' }, { value: 'EXPIRED', label: 'Expired' }, { value: 'CANCELLED', label: 'Cancelled' }]} />
            <FilterSelect list={list} name="planId" label="Plan" options={(plans.data ?? []).map((p) => ({ value: String(p.id), label: p.name }))} />
            <DateRangeFilter list={list} label="Created" />
          </>
        }
        empty={<Empty icon={<Building2 className="size-5" />} title="No companies yet" action={<Link href="/admin/onboarding" className={buttonClass()}>Onboard the first company</Link>} />}
        columns={[
          { key: 'name', header: 'Company', sort: 'displayName', primary: true, cell: (r) => <div className="min-w-0"><p className="truncate font-medium">{r.displayName}</p><p className="truncate text-xs text-fg-muted">{r.legalName}</p></div> },
          { key: 'plan', header: 'Plan', cell: (r) => r.plan?.name ?? '—' },
          { key: 'billing', header: 'Billing', cell: (r) => <Badge value={r.subscriptionStatus} label={r.subscriptionStatus === 'TRIALING' && r.trialEndsAt ? `Trial · ends ${date(r.trialEndsAt)}` : undefined} /> },
          { key: 'services', header: 'Brands', align: 'right', hideOnMobile: true, cell: (r) => r._count.services },
          { key: 'users', header: 'Users', align: 'right', hideOnMobile: true, cell: (r) => r._count.memberships },
          { key: 'created', header: 'Created', sort: 'createdAt', cell: (r) => date(r.createdAt) },
          { key: 'status', header: 'Status', sort: 'status', cell: (r) => <Badge value={r.status} /> },
        ]}
      />
    </>
  );
}
