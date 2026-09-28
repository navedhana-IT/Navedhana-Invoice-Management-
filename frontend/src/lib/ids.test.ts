import { afterEach, describe, expect, it, vi } from 'vitest';
import { request, tenant } from './api';
import { toId } from './ids';

describe('toId', () => {
  it('accepts positive integers from numbers, route params and select values', () => {
    expect(toId(1)).toBe(1);
    expect(toId('42')).toBe(42);
    expect(toId(' 7 ')).toBe(7);
    expect(toId(String(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
  });

  it.each([0, -1, 1.5, '0', '-3', '01', '1e3', '12abc', '', null, undefined, '9007199254740993', '3f2504e0-4f89-11d3-9a0c-0305e82c3301'])(
    'rejects %p',
    (v) => expect(toId(v)).toBeUndefined(),
  );
});

describe('tenant ids', () => {
  afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });

  it('stores numeric ids and sends them as headers', async () => {
    tenant.setCompany(3);
    tenant.setService(12);
    expect(tenant.companyId).toBe(3);
    expect(tenant.serviceId).toBe(12);
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    await request('/invoices');
    expect(fetch.mock.calls[0][1].headers).toMatchObject({ 'X-Company-Id': '3', 'X-Service-Id': '12' });
  });

  it('ignores stored values that are not ids, such as UUIDs from older builds', () => {
    localStorage.setItem('nv.company', '3f2504e0-4f89-11d3-9a0c-0305e82c3301');
    localStorage.setItem('nv.service', 'abc');
    expect(tenant.companyId).toBeNull();
    expect(tenant.serviceId).toBeNull();
  });

  it('switching company clears the brand', () => {
    tenant.setService(5);
    tenant.setCompany(2);
    expect(tenant.serviceId).toBeNull();
  });
});
