'use client';
import {
  BarChart3, Boxes, Briefcase, Building2, FileText, History, LayoutDashboard, LayoutTemplate, Receipt, Settings, ShieldCheck, Truck, UserSquare2, Users, UsersRound, Wallet,
} from 'lucide-react';
import { Empty } from '@/components/ui';
import { Shell, ShellFallback, TenantSwitcher, type NavItem } from '@/components/shell/shell';
import { TrialBanner } from '@/features/billing/trial-banner';
import { NotificationBell, RealtimeBridge } from '@/features/notifications/notifications';
import { SessionProvider, useSession } from '@/lib/session';

const NAV: NavItem[] = [
  { href: '/app', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/app/services', label: 'Brands', icon: Building2, perm: 'service.view' },
  { href: '/app/invoices', label: 'Sales invoices', icon: FileText, perm: 'invoice.view', group: 'Billing' },
  { href: '/app/purchases', label: 'Purchase bills', icon: Receipt, perm: 'invoice.view', group: 'Billing' },
  { href: '/app/payments', label: 'Payments', icon: Wallet, perm: 'payment.view', group: 'Billing' },
  { href: '/app/templates', label: 'Invoice templates', icon: LayoutTemplate, perm: 'template.view', group: 'Billing' },
  { href: '/app/customers', label: 'Customers', icon: UsersRound, perm: 'customer.view', group: 'Directory' },
  { href: '/app/vendors', label: 'Vendors', icon: Truck, perm: 'vendor.view', group: 'Directory' },
  { href: '/app/products', label: 'Products & services', icon: Boxes, perm: 'product.view', group: 'Directory' },
  { href: '/app/employees', label: 'Employees', icon: UserSquare2, perm: 'employee.view', group: 'Directory' },
  { href: '/app/departments', label: 'Departments', icon: Briefcase, perm: 'department.view', group: 'Directory' },
  { href: '/app/reports', label: 'Reports', icon: BarChart3, perm: 'report.view', group: 'Insights' },
  { href: '/app/settings', label: 'Company', icon: Settings, perm: 'company.view', group: 'Settings' },
  { href: '/app/users', label: 'Members', icon: Users, perm: 'user.view', group: 'Settings' },
  { href: '/app/roles', label: 'Roles', icon: ShieldCheck, perm: 'role.view', group: 'Settings' },
  { href: '/app/audit', label: 'Audit log', icon: History, perm: 'audit.view', group: 'Settings' },
];

function Inner({ children }: { children: React.ReactNode }) {
  const { can, companyId, me } = useSession();
  if (!companyId) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Empty title="No active workspace" description={me.isMasterAdmin ? 'Open a company from the admin console.' : 'Your account is not a member of any active company yet.'} />
      </div>
    );
  }
  return (
    <Shell nav={NAV.filter((n) => !n.perm || can(n.perm))} home="/app" top={<TenantSwitcher />} actions={<NotificationBell />} banner={<TrialBanner />}>
      <RealtimeBridge />
      {children}
    </Shell>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider fallback={<ShellFallback />}>
      <Inner>{children}</Inner>
    </SessionProvider>
  );
}
