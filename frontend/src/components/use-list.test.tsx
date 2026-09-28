import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
const apiMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => '/app/customers',
  useSearchParams: () => nav.params,
}));
vi.mock('@/lib/session', () => ({ useSession: () => ({ companyId: 'c1', serviceId: 's1' }) }));
vi.mock('@/lib/api', () => ({ api: apiMock }));

const { useList } = await import('./data');

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);
const hook = (qs: string, opts?: Parameters<typeof useList>[1]) => {
  nav.params = new URLSearchParams(qs);
  return renderHook(() => useList('/customers', opts), { wrapper }).result;
};
const lastUrl = () => nav.replace.mock.calls.at(-1)?.[0];

beforeEach(() => {
  nav.replace.mockClear();
  apiMock.mockReset().mockResolvedValue({ data: [], meta: { page: 1, limit: 20, total: 0 } });
});

describe('useList URL state', () => {
  it('reads page, size, search, sort and filters from the URL into the request', async () => {
    const r = hook('page=3&limit=50&q=acme&sort=name:asc&status=OPEN&ignored=1', { filters: ['status'] });
    expect(r.current).toMatchObject({ page: 3, limit: 50, search: 'acme', sort: { field: 'name', dir: 'asc' }, filters: { status: 'OPEN' }, activeFilters: 1 });
    await waitFor(() => expect(apiMock).toHaveBeenCalled());
    expect(apiMock.mock.calls[0][1].query).toMatchObject({ page: 3, limit: 50, search: 'acme', sort: 'name:asc', status: 'OPEN' });
    expect(apiMock.mock.calls[0][1].query).not.toHaveProperty('ignored');
  });

  it('falls back to safe defaults for bad values', () => {
    const r = hook('page=-4&limit=5000', { sort: 'createdAt:desc' });
    expect(r.current).toMatchObject({ page: 1, limit: 100, sort: { field: 'createdAt', dir: 'desc' } });
  });

  it('resets the page when search or filters change', () => {
    const r = hook('page=4&q=old', { filters: ['status'] });
    act(() => r.current.setSearch('  new  '));
    expect(lastUrl()).toBe('/app/customers?q=new');
    act(() => r.current.setFilter('status', 'PAID'));
    expect(lastUrl()).toBe('/app/customers?q=old&status=PAID');
  });

  it('keeps other params when paging and drops page 1 from the URL', () => {
    const r = hook('q=acme&page=2');
    act(() => r.current.setPage(3));
    expect(lastUrl()).toBe('/app/customers?q=acme&page=3');
    act(() => r.current.setPage(1));
    expect(lastUrl()).toBe('/app/customers?q=acme');
  });

  it('cycles sort direction and omits the default sort', () => {
    let r = hook('', { sort: 'createdAt:desc' });
    act(() => r.current.toggleSort('name'));
    expect(lastUrl()).toBe('/app/customers?sort=name%3Adesc');
    r = hook('sort=name:desc', { sort: 'createdAt:desc' });
    act(() => r.current.toggleSort('name'));
    expect(lastUrl()).toBe('/app/customers?sort=name%3Aasc');
    r = hook('sort=createdAt:asc', { sort: 'createdAt:desc' });
    act(() => r.current.toggleSort('createdAt'));
    expect(lastUrl()).toBe('/app/customers');
  });

  it('clears search, sort and filters but keeps unrelated params', () => {
    const r = hook('q=a&sort=name:asc&status=OPEN&tab=x', { filters: ['status'] });
    act(() => r.current.clear());
    expect(lastUrl()).toBe('/app/customers?tab=x');
  });
});
