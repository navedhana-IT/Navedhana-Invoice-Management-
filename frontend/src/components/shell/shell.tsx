'use client';
import { Command } from 'cmdk';
import {
  ChevronDown,
  ChevronsUpDown,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sun,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { BrandMark, Logo } from '@/components/logo';
import {
  DropdownMenu,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  Sheet,
  Skeleton,
  Tooltip,
} from '@/components/ui';
import { toId } from '@/lib/ids';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

export type NavItem = { href: string; label: string; icon: LucideIcon; perm?: string; group?: string };

/** Sidebar + topbar + ⌘K palette shared by /admin and /app. */
export function Shell({
  nav,
  home,
  top,
  actions,
  banner,
  account = '/app/account',
  children,
}: {
  nav: NavItem[];
  home: string;
  top?: ReactNode;
  actions?: ReactNode;
  banner?: ReactNode;
  account?: string;
  children: ReactNode;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Restore sidebar collapsed preference from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('nav_sidebar_collapsed');
      if (stored !== null) setCollapsed(stored === 'true');
    } catch { }
  }, []);

  const toggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('nav_sidebar_collapsed', String(next));
      } catch { }
      return next;
    });
  };

  useEffect(() => setOpen(false), [path]);

  // Global hotkeys: Ctrl/Cmd+K for palette, Ctrl/Cmd+B for sidebar toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key?.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPalette((v) => !v);
      } else if (e.key?.toLowerCase() === 'b' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-fg"
      >
        Skip to content
      </a>

      {/* Desktop collapsible sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden flex-col border-r bg-surface transition-[width] duration-200 ease-in-out lg:flex',
          collapsed ? 'w-18' : 'w-64'
        )}
      >
        <Sidebar
          nav={nav}
          home={home}
          account={account}
          collapsed={collapsed}
          onToggleCollapse={toggleSidebar}
        />
      </aside>

      {/* Mobile navigation sheet */}
      <Sheet open={open} onClose={() => setOpen(false)} title="Navigation" side="left" className="w-72">
        <button
          onClick={() => setOpen(false)}
          className="absolute right-3 top-4 z-10 rounded-md p-1.5 text-fg-muted hover:bg-muted"
          aria-label="Close menu"
        >
          <X className="size-4" />
        </button>
        <Sidebar
          nav={nav}
          home={home}
          account={account}
          collapsed={false}
          onCloseMobile={() => setOpen(false)}
        />
      </Sheet>

      {/* Main workspace container */}
      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col transition-[padding-left] duration-200 ease-in-out',
          collapsed ? 'lg:pl-18' : 'lg:pl-64'
        )}
      >
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-surface/85 px-3 backdrop-blur sm:h-16 sm:gap-3 sm:px-4 lg:px-8">
          {/* Mobile open hamburger menu */}
          <button
            className="rounded-md p-2 hover:bg-muted lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
          >
            <Menu className="size-5" />
          </button>

          {/* Desktop sidebar collapse / expand toggle icon */}
          <Tooltip content={collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'} side="bottom">
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
              className="hidden lg:flex size-9 items-center justify-center rounded-lg border border-border-input bg-surface text-fg-muted hover:border-border-strong hover:bg-muted hover:text-fg shadow-xs transition-colors"
            >
              {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            </button>
          </Tooltip>

          <div className="flex min-w-0 items-center gap-2">{top}</div>

          <button
            onClick={() => setPalette(true)}
            aria-label="Search pages (Ctrl+K)"
            className="ml-auto flex h-9 items-center gap-2 rounded-lg border border-border-input bg-bg px-2.5 text-sm text-fg-muted hover:border-border-strong hover:bg-muted md:w-60 md:px-3"
          >
            <Search className="size-4" /> <span className="hidden md:inline">Jump to…</span>
            <kbd className="ml-auto hidden rounded border border-border-input bg-surface px-1.5 text-[10px] md:inline">⌘K</kbd>
          </button>
          {actions}
        </header>

        {banner}

        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl flex-1 p-4 outline-none sm:p-6 lg:p-8 2xl:max-w-[1440px]"
        >
          <Suspense fallback={<PageFallback />}>{children}</Suspense>
        </main>
      </div>

      <Palette open={palette} onClose={() => setPalette(false)} nav={nav} />
    </div>
  );
}

function Sidebar({
  nav,
  home,
  account,
  collapsed = false,
  onToggleCollapse,
  onCloseMobile,
}: {
  nav: NavItem[];
  home: string;
  account: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onCloseMobile?: () => void;
}) {
  const path = usePathname();
  const groups = [...new Set(nav.map((n) => n.group ?? ''))];

  // Check if current URL is /app/invoices/new?type=PURCHASE
  const [isPurchaseNew, setIsPurchaseNew] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined' && path === '/app/invoices/new') {
      const sp = new URLSearchParams(window.location.search);
      setIsPurchaseNew(sp.get('type') === 'PURCHASE');
    } else {
      setIsPurchaseNew(false);
    }
  }, [path]);

  const active = useCallback(
    (href: string) => {
      if (isPurchaseNew) {
        if (href === '/app/purchases') return true;
        if (href === '/app/invoices') return false;
      }
      return href === home ? path === home : path === href || path.startsWith(`${href}/`);
    },
    [home, path, isPurchaseNew]
  );

  // Collapsed state for individual groups (e.g. 'Billing', 'Directory', 'Insights', 'Settings')
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Restore group collapsed states from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('nav_collapsed_groups');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const map: Record<string, boolean> = {};
          parsed.forEach((g: string) => {
            map[g] = true;
          });
          setCollapsedGroups(map);
        }
      }
    } catch { }
  }, []);

  // Ensure any group containing the current active route is automatically expanded
  useEffect(() => {
    const activeItem = nav.find((n) => active(n.href));
    if (activeItem?.group) {
      setCollapsedGroups((prev) => {
        if (prev[activeItem.group!]) {
          const next = { ...prev };
          delete next[activeItem.group!];
          try {
            localStorage.setItem('nav_collapsed_groups', JSON.stringify(Object.keys(next)));
          } catch { }
          return next;
        }
        return prev;
      });
    }
  }, [active, nav]);

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups((prev) => {
      const next = { ...prev, [groupName]: !prev[groupName] };
      try {
        const collapsedKeys = Object.keys(next).filter((k) => next[k]);
        localStorage.setItem('nav_collapsed_groups', JSON.stringify(collapsedKeys));
      } catch { }
      return next;
    });
  };

  return (
    <>
      {/* Sidebar Header */}
      <div
        className={cn(
          'flex h-16 shrink-0 items-center border-b',
          collapsed ? 'justify-center px-2' : 'px-5'
        )}
      >
        {collapsed ? (
          <Tooltip content="Expand sidebar (Ctrl+B)" side="right">
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Expand sidebar"
              className="grid size-10 place-items-center rounded-lg hover:bg-muted transition-colors"
            >
              <BrandMark className="size-9" />
            </button>
          </Tooltip>
        ) : (
          <Logo href={home} imageClassName="h-12 max-w-[200px]" />
        )}
      </div>

      {/* Navigation list */}
      <nav
        className={cn(
          'flex-1 overflow-y-auto overscroll-contain',
          collapsed ? 'px-2 py-3' : 'p-3'
        )}
        aria-label="Main"
      >
        {groups.map((g) => {
          const groupItems = nav.filter((n) => (n.group ?? '') === g);
          if (groupItems.length === 0) return null;

          // Top items without a group (e.g. Dashboard, Brands)
          if (!g) {
            return (
              <div key="ungrouped" className={cn(collapsed ? 'mb-2' : 'mb-3')}>
                <ul className="space-y-0.5">
                  {groupItems.map((n) => {
                    const isActive = active(n.href);
                    return (
                      <li key={n.href}>
                        {collapsed ? (
                          <Tooltip content={n.label} side="right">
                            <Link
                              href={n.href}
                              onClick={onCloseMobile}
                              aria-current={isActive ? 'page' : undefined}
                              aria-label={n.label}
                              className={cn(
                                'flex size-10 mx-auto items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-muted hover:text-fg',
                                isActive &&
                                'bg-primary-soft font-medium text-primary hover:bg-primary-soft hover:text-primary'
                              )}
                            >
                              <n.icon className="size-4 shrink-0" aria-hidden />
                            </Link>
                          </Tooltip>
                        ) : (
                          <Link
                            href={n.href}
                            onClick={onCloseMobile}
                            aria-current={isActive ? 'page' : undefined}
                            className={cn(
                              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-muted hover:text-fg',
                              isActive &&
                              'bg-primary-soft font-medium text-primary hover:bg-primary-soft hover:text-primary'
                            )}
                          >
                            <n.icon className="size-4 shrink-0" aria-hidden />
                            <span className="truncate">{n.label}</span>
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          }

          // Grouped items (e.g. Billing, Directory, Insights, Settings)
          const isGroupCollapsed = !!collapsedGroups[g];
          const hasActiveItem = groupItems.some((n) => active(n.href));
          const groupId = `nav-group-${g.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

          if (collapsed) {
            // Collapsed Rail Mode
            return (
              <div key={g} className="mb-2">
                <div className="mx-2 my-1.5 h-px bg-border/60" />
                <Tooltip content={`${g} (${isGroupCollapsed ? 'closed' : 'open'})`} side="right">
                  <button
                    type="button"
                    onClick={() => toggleGroup(g)}
                    aria-expanded={!isGroupCollapsed}
                    aria-label={`Toggle ${g}`}
                    className="flex w-full items-center justify-center py-1 text-fg-subtle hover:text-fg transition-colors"
                  >
                    <span className="text-[9px] font-bold uppercase tracking-wider text-fg-subtle/80">
                      {g.slice(0, 3)}
                    </span>
                  </button>
                </Tooltip>

                <div
                  className={cn(
                    'grid transition-all duration-200 ease-in-out',
                    isGroupCollapsed
                      ? 'grid-rows-[0fr] opacity-0 pointer-events-none'
                      : 'grid-rows-[1fr] opacity-100'
                  )}
                >
                  <ul className="overflow-hidden space-y-1 pt-0.5">
                    {groupItems.map((n) => {
                      const isActive = active(n.href);
                      return (
                        <li key={n.href} className="flex justify-center">
                          <Tooltip content={`${n.label} • ${g}`} side="right">
                            <Link
                              href={n.href}
                              onClick={onCloseMobile}
                              aria-current={isActive ? 'page' : undefined}
                              aria-label={n.label}
                              className={cn(
                                'flex size-10 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-muted hover:text-fg',
                                isActive &&
                                'bg-primary-soft font-medium text-primary hover:bg-primary-soft hover:text-primary'
                              )}
                            >
                              <n.icon className="size-4 shrink-0" aria-hidden />
                            </Link>
                          </Tooltip>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            );
          }

          // Expanded Sidebar Mode: Collapsible Group Header
          return (
            <div key={g} className="mb-3">
              <button
                type="button"
                onClick={() => toggleGroup(g)}
                aria-expanded={!isGroupCollapsed}
                aria-controls={groupId}
                className={cn(
                  'group flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle transition-colors hover:bg-muted/70 hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring select-none',
                  hasActiveItem && 'text-fg font-bold'
                )}
              >
                <span className="flex items-center gap-1.5">
                  <span>{g}</span>
                  {hasActiveItem && (
                    <span className="size-1.5 rounded-full bg-primary" aria-label="Current page in this group" />
                  )}
                </span>
                <span className="flex items-center gap-1 text-fg-subtle group-hover:text-fg">
                  <span className="text-[10px] font-normal text-fg-subtle/80 opacity-0 transition-opacity group-hover:opacity-100">
                    {isGroupCollapsed ? 'Open' : 'Close'}
                  </span>
                  <ChevronDown
                    className={cn(
                      'size-3.5 transition-transform duration-200',
                      isGroupCollapsed && '-rotate-90'
                    )}
                    aria-hidden
                  />
                </span>
              </button>

              <div
                id={groupId}
                className={cn(
                  'grid transition-all duration-200 ease-in-out',
                  isGroupCollapsed
                    ? 'grid-rows-[0fr] opacity-0 pointer-events-none'
                    : 'grid-rows-[1fr] opacity-100 mt-0.5'
                )}
              >
                <ul className="overflow-hidden space-y-0.5">
                  {groupItems.map((n) => {
                    const isActive = active(n.href);
                    return (
                      <li key={n.href}>
                        <Link
                          href={n.href}
                          onClick={onCloseMobile}
                          aria-current={isActive ? 'page' : undefined}
                          className={cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-muted hover:text-fg',
                            isActive &&
                            'bg-primary-soft font-medium text-primary hover:bg-primary-soft hover:text-primary'
                          )}
                        >
                          <n.icon className="size-4 shrink-0" aria-hidden />
                          <span className="truncate">{n.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          );
        })}
      </nav>

      {/* User profile & account menu */}
      <UserMenu account={account} collapsed={collapsed} />


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

function UserMenu({ account, collapsed }: { account: string; collapsed?: boolean }) {
  const { me, logout } = useSession();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  return (
    <div className={cn('border-t p-3', collapsed && 'p-2 flex justify-center')}>
      <DropdownMenu
        align={collapsed ? 'start' : 'start'}
        label="Account menu"
        trigger={
          collapsed ? (
            <Tooltip content={`${me.fullName} (${me.email})`} side="right">
              <button
                className="grid size-10 place-items-center rounded-lg hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/60 transition-colors"
                aria-label="Account menu"
              >
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary"
                  aria-hidden
                >
                  {me.fullName.charAt(0).toUpperCase()}
                </span>
              </button>
            </Tooltip>
          ) : (
            <button className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-muted">
              <span
                className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary"
                aria-hidden
              >
                {me.fullName.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{me.fullName}</span>
                <span className="block truncate text-xs text-fg-muted">{me.email}</span>
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-fg-muted" aria-hidden />
            </button>
          )
        }
      >
        <MenuLabel>Signed in as {me.email}</MenuLabel>
        <MenuItem icon={<UserRound />} onSelect={() => router.push(account)}>Account settings</MenuItem>
        <MenuItem icon={dark ? <Sun /> : <Moon />} onSelect={() => setTheme(dark ? 'light' : 'dark')}>
          {dark ? 'Light theme' : 'Dark theme'}
        </MenuItem>
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
          <p className="font-semibold tracking-tight">nbills</p>
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
      className="select-chevron h-9 w-32 min-w-0 cursor-pointer appearance-none truncate rounded-lg border border-border-input bg-surface pl-3 pr-8 text-sm font-medium shadow-xs hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-ring/60 sm:w-auto sm:max-w-56">
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
