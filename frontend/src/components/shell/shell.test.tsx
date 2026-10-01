import { fireEvent, render, screen } from '@testing-library/react';
import { FileText, LayoutDashboard, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui';
import { Shell, type NavItem } from './shell';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/app/invoices',
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }),
}));

vi.mock('@/lib/session', () => ({
  useSession: () => ({
    me: { fullName: 'Jane Doe', email: 'jane@example.com', memberships: [] },
    logout: vi.fn(),
    can: () => true,
  }),
}));

const mockNav: NavItem[] = [
  { href: '/app', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/app/invoices', label: 'Sales invoices', icon: FileText, group: 'Billing' },
  { href: '/app/customers', label: 'Customers', icon: Users, group: 'Directory' },
];

function renderShell(children: ReactNode = <div>Page Content</div>) {
  return render(
    <TooltipProvider>
      <Shell nav={mockNav} home="/app">
        {children}
      </Shell>
    </TooltipProvider>
  );
}

describe('Shell sidebar & collapsible groups', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders sidebar with navigation items and group headers', () => {
    renderShell();
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Billing').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Directory').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sales invoices').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Customers').length).toBeGreaterThan(0);
  });

  it('toggles collapsible groups (Billing, Directory) open and close', () => {
    renderShell();
    const directoryButtons = screen.getAllByRole('button', { name: /Directory/i });
    const directoryBtn = directoryButtons[0];
    expect(directoryBtn).toHaveAttribute('aria-expanded', 'true');

    // Click to close/collapse Directory
    fireEvent.click(directoryBtn);
    expect(directoryBtn).toHaveAttribute('aria-expanded', 'false');

    // Click again to open Directory
    fireEvent.click(directoryBtn);
    expect(directoryBtn).toHaveAttribute('aria-expanded', 'true');
  });

  it('toggles sidebar collapse with the desktop topbar toggle button and keeps sidebar header clean', () => {
    const { container } = renderShell();
    // Verify sidebar header in aside element does not have a close button
    const aside = container.querySelector('aside');
    expect(aside).not.toBeNull();
    const asideHeader = aside?.querySelector('div');
    expect(asideHeader?.querySelector('button')).toBeNull();

    const collapseButtons = screen.getAllByRole('button', { name: /Collapse sidebar/i });
    expect(collapseButtons.length).toBe(1);

    // Click to collapse
    fireEvent.click(collapseButtons[0]);
    const expandButtons = screen.getAllByRole('button', { name: /Expand sidebar/i });
    expect(expandButtons.length).toBeGreaterThan(0);

    // Click to expand back
    fireEvent.click(expandButtons[0]);
    expect(screen.getAllByRole('button', { name: /Collapse sidebar/i }).length).toBe(1);
  });
});
