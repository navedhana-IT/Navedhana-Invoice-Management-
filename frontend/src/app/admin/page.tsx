'use client';
import { useQuery } from '@tanstack/react-query';
import { Building2, FileText, IndianRupee, Rocket, Users } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/data';
import { buttonClass, Card, CardHeader, Skeleton, Stat } from '@/components/ui';
import { api } from '@/lib/api';
import { dateTime, money, titleCase } from '@/lib/utils';
import type { Id } from '@/lib/ids';

type AdminDashboard = {
  companies: number; activeCompanies: number; users: number; issuedInvoices: number; paymentsCount: number; paymentsTotal: string;
  activity30d: { action: string; count: number }[];
  recentAudit: { id: Id; action: string; entityType: string; createdAt: string }[];
};

export default function AdminHome() {
  const { data: d } = useQuery({ queryKey: ['admin-dashboard'], queryFn: () => api<AdminDashboard>('/admin/dashboard') });
  const max = Math.max(1, ...(d?.activity30d.map((a) => a.count) ?? []));
  return (
    <>
      <PageHeader title="Platform overview" description="All tenants at a glance." actions={<Link href="/admin/onboarding" className={buttonClass()}><Rocket className="size-4" /> Onboard company</Link>} />
      {!d ? <Skeleton className="h-64" /> : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Companies" value={d.companies} hint={`${d.activeCompanies} active`} icon={<Building2 className="size-4" />} />
            <Stat label="Users" value={d.users} icon={<Users className="size-4" />} />
            <Stat label="Issued invoices" value={d.issuedInvoices} icon={<FileText className="size-4" />} />
            <Stat label="Payments processed" value={money(d.paymentsTotal)} hint={`${d.paymentsCount} payments`} icon={<IndianRupee className="size-4" />} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Activity (30 days)" />
              <ul className="space-y-2 p-5">
                {d.activity30d.map((a) => (
                  <li key={a.action} className="text-sm">
                    <div className="flex justify-between"><span>{titleCase(a.action)}</span><span className="num text-fg-muted">{a.count}</span></div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(a.count / max) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Recent events" action={<Link href="/admin/audit" className="text-sm text-primary">View all</Link>} />
              <ul className="divide-y">
                {d.recentAudit.map((e) => (
                  <li key={e.id} className="flex justify-between px-5 py-2.5 text-sm"><span>{titleCase(e.action)} <span className="text-fg-muted">· {titleCase(e.entityType)}</span></span><span className="text-fg-muted">{dateTime(e.createdAt)}</span></li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
