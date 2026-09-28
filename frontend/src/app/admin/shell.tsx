'use client';
import { Building2, CreditCard, History, LayoutDashboard, Rocket, Settings, Users } from 'lucide-react';
import Link from 'next/link';
import { buttonClass, Empty } from '@/components/ui';
import { Shell, ShellFallback, type NavItem } from '@/components/shell/shell';
import { SessionProvider, useSession } from '@/lib/session';

const NAV: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/companies', label: 'Companies', icon: Building2, group: 'Tenants' },
  { href: '/admin/onboarding', label: 'Onboard company', icon: Rocket, group: 'Tenants' },
  { href: '/admin/plans', label: 'Plans', icon: CreditCard, group: 'Platform' },
  { href: '/admin/users', label: 'Users', icon: Users, group: 'Platform' },
  { href: '/admin/audit', label: 'Audit log', icon: History, group: 'Platform' },
  { href: '/admin/account', label: 'Settings', icon: Settings, group: 'Platform' },
];

function Inner({ children }: { children: React.ReactNode }) {
  const { me } = useSession();
  if (!me.isMasterAdmin) return <div className="grid min-h-screen place-items-center"><Empty title="Master admin only" description="Your account cannot access the platform console."
    action={<Link href="/app" className={buttonClass({ variant: "secondary" })}>Go to workspace</Link>} /></div>;
  return (
    <Shell nav={NAV} home="/admin" account="/admin/account" top={<span className="rounded-full bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-700 dark:text-violet-300">Platform admin</span>}>
      {children}
    </Shell>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider fallback={<ShellFallback />}>
      <Inner>{children}</Inner>
    </SessionProvider>
  );
}
