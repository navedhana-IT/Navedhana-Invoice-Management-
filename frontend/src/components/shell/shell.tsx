'use client';
import { Command } from 'cmdk';
import { ChevronsUpDown, LogOut, Menu, Moon, Search, Sun, UserRound, X, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { BrandMark, Logo } from '@/components/logo';
import { DropdownMenu, MenuItem, MenuLabel, MenuSeparator, Sheet, Skeleton } from '@/components/ui';
import { toId } from '@/lib/ids';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

export type NavItem = { href: string; label: string; icon: LucideIcon; perm?: string; group?: string };

/** Sidebar + topbar + ⌘K palette shared by /admin and /app. */
export function Shell({ nav, home, top, actions, banner, account = '/app/account', children }: {
  nav: NavItem[]; home: string; top?: ReactNode; actions?: ReactNode; banner?: ReactNode; account?: string; children: ReactNode;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = useState(false);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key?.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setPalette((v) => !v); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-fg">Skip to content</a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-surface lg:flex">
        <Sidebar nav={nav} home={home} account={account} />
      </aside>
      <Sheet open={open} onClose={() => setOpen(false)} title="Navigation" side="left" className="w-72">
        <button onClick={() => setOpen(false)} className="absolute right-3 top-4 rounded-md p-1.5 text-fg-muted hover:bg-muted" aria-label="Close menu"><X className="size-4" /></button>
        <Sidebar nav={nav} home={home} account={account} />
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-surface/85 px-3 backdrop-blur sm:h-16 sm:gap-3 sm:px-4 lg:px-8">
          <button className="rounded-md p-2 hover:bg-muted lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}><Menu className="size-5" /></button>
          <div className="flex min-w-0 items-center gap-2">{top}</div>
          <button onClick={() => setPalette(true)} aria-label="Search pages (Ctrl+K)"
            className="ml-auto flex h-9 items-center gap-2 rounded-lg border bg-bg px-2.5 text-sm text-fg-muted hover:bg-muted md:w-60 md:px-3">
            <Search className="size-4" /> <span className="hidden md:inline">Jump to…</span>
            <kbd className="ml-auto hidden rounded border bg-surface px-1.5 text-[10px] md:inline">⌘K</kbd>
          </button>
          {actions}
        </header>
        {banner}
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 p-4 outline-none sm:p-6 lg:p-8 2xl:max-w-[1440px]">
          <Suspense fallback={<PageFallback />}>{children}</Suspense>
        </main>
      </div>
      <Palette open={palette} onClose={() => setPalette(false)} nav={nav} />
    </div>
  );
}

function Sidebar({ nav, home, account }: { nav: NavItem[]; home: string; account: string }) {
  const path = usePathname();
  const groups = [...new Set(nav.map((n) => n.group ?? ''))];
  const active = (href: string) => (href === home ? path === home : path === href || path.startsWith(`${href}/`));
  return (
    <>
      <div className="flex h-16 shrink-0 items-center border-b px-5"><Logo href={home} /></div>
      <nav className="flex-1 overflow-y-auto overscroll-contain p-3" aria-label="Main">
        {groups.map((g) => (
          <div key={g} className="mb-4">
            {g && <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">{g}</p>}
            <ul>
              {nav.filter((n) => (n.group ?? '') === g).map((n) => (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    aria-current={active(n.href) ? 'page' : undefined}
                    className={cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-muted hover:text-fg', active(n.href) && 'bg-primary-soft font-medium text-primary hover:bg-primary-soft hover:text-primary')}
                  >
                    <n.icon className="size-4 shrink-0" aria-hidden /> <span className="truncate">{n.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <UserMenu account={account} />
      <p className="border-t px-5 py-2.5 text-[11px] text-fg-subtle">A Navedhana Product</p>
    </>
  );
}

function Palette({ open, onClose, nav }: { open: boolean; onClose: () => void; nav: NavItem[] }) {
  const router = useRouter();
  return (
    <Command.Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      label="Jump to page"
      overlayClassName="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px]"
      contentClassName="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border bg-surface shadow-lg"
    >
      <Command.Input autoFocus placeholder="Jump to…" className="h-12 w-full border-b bg-transparent px-4 text-sm outline-none placeholder:text-fg-subtle" />
      <Command.List className="max-h-80 overflow-y-auto p-2">
        <Command.Empty className="p-4 text-center text-sm text-fg-muted">No matching pages</Command.Empty>
        {nav.map((n) => (
          <Command.Item
            key={n.href}
            value={`${n.group ?? ''} ${n.label}`}
            onSelect={() => { router.push(n.href); onClose(); }}
            className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-muted"
          >
            <n.icon className="size-4 text-fg-muted" aria-hidden /> {n.label}
            {n.group && <span className="ml-auto text-xs text-fg-subtle">{n.group}</span>}
          </Command.Item>
        ))}
      </Command.List>
    </Command.Dialog>
  );
}

function UserMenu({ account }: { account: string }) {
  const { me, logout } = useSession();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  return (
    <div className="border-t p-3">
      <DropdownMenu
        align="start"
        label="Account menu"
        trigger={
          <button className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-muted">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary" aria-hidden>{me.fullName.charAt(0).toUpperCase()}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{me.fullName}</span>
              <span className="block truncate text-xs text-fg-muted">{me.email}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-fg-muted" aria-hidden />
          </button>
        }
      >
        <MenuLabel>Signed in as {me.email}</MenuLabel>
        <MenuItem icon={<UserRound />} onSelect={() => router.push(account)}>Account settings</MenuItem>
        <MenuItem icon={dark ? <Sun /> : <Moon />} onSelect={() => setTheme(dark ? 'light' : 'dark')}>{dark ? 'Light theme' : 'Dark theme'}</MenuItem>
        <MenuSeparator />
        <MenuItem icon={<LogOut />} onSelect={logout}>Sign out</MenuItem>
      </DropdownMenu>
    </div>
  );
}

function PageFallback() {
  return <div className="space-y-4" aria-busy><Skeleton className="h-8 w-60" /><Skeleton className="h-40 w-full" /></div>;
}

export function ShellFallback() {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg" aria-busy role="status" aria-label="Loading your workspace">
      <div className="flex flex-col items-center gap-4">
        <BrandMark className="size-12 animate-pulse" />
        <div className="text-center">
          <p className="font-semibold tracking-tight">Navedhana Ledger</p>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-fg-subtle">A Navedhana Product</p>
        </div>
        <div className="h-1 w-32 overflow-hidden rounded-full bg-muted"><div className="h-full w-1/3 animate-[loading_1.1s_ease-in-out_infinite] rounded-full bg-primary" /></div>
      </div>
    </div>
  );
}

/** Company + service switcher. Changing service sets X-Service-Id for all subsequent API calls. */
export function TenantSwitcher() {
  const { me, ctx, companyId, serviceId, setCompany, setService } = useSession();
  const companies = me.memberships.map((m) => m.company);
  if (ctx && !companies.some((c) => c.id === ctx.company.id)) companies.push(ctx.company);
  return (
    <>
      {companies.length > 1 && (
        <Picker label="Company" value={String(companyId ?? '')} onChange={(v) => { const id = toId(v); if (id) setCompany(id); }} options={companies.map((c) => ({ value: String(c.id), label: c.displayName }))} />
      )}
      <Picker
        label="Brand"
        value={String(serviceId ?? '')}
        onChange={(v) => setService(toId(v) ?? null)}
        options={[{ value: '', label: 'All brands' }, ...(ctx?.services ?? []).map((s) => ({ value: String(s.id), label: s.displayName ?? s.name }))]}
      />
    </>
  );
}

function Picker({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}
      className="select-chevron h-9 w-32 min-w-0 cursor-pointer appearance-none truncate rounded-lg border bg-surface pl-3 pr-8 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/60 sm:w-auto sm:max-w-56">
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
