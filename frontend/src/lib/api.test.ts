import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, SUBSCRIPTION_EVENT } from './api';

const respond = (status: number, body?: unknown, headers: Record<string, string> = {}) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } }),
  );

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('expected the call to fail');
};

afterEach(() => vi.restoreAllMocks());

describe('api error mapping', () => {
  it('maps the backend envelope onto ApiError', async () => {
    respond(409, { statusCode: 409, code: 'EMAIL_TAKEN', message: 'That email is already registered', requestId: 'req-1' });
    const e = await failure(api('/x'));
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 409, code: 'EMAIL_TAKEN', message: 'That email is already registered', requestId: 'req-1' });
  });

  it('keeps field errors and shows the first one', async () => {
    respond(400, { statusCode: 400, code: 'VALIDATION', message: ['email must be an email', 'name is required'] });
    const e = await failure(api('/x'));
    expect(e.message).toBe('email must be an email');
    expect(e.errors).toEqual(['email must be an email', 'name is required']);
  });

  it('hides server internals on 5xx and falls back to friendly text', async () => {
    respond(500, { message: 'TypeError: cannot read x of undefined' }, { 'x-request-id': 'req-2' });
    const e = await failure(api('/x'));
    expect(e.message).toMatch(/went wrong on our side/);
    expect(e.requestId).toBe('req-2');

    respond(403, {});
    expect((await failure(api('/x'))).message).toBe('You don’t have permission to do that.');
  });

  it('reports network failures with a NETWORK code', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await failure(api('/x'))).toMatchObject({ status: 0, code: 'NETWORK' });
  });

  it('announces a lapsed subscription on 402', async () => {
    const listener = vi.fn();
    window.addEventListener(SUBSCRIPTION_EVENT, listener);
    respond(402, { code: 'SUBSCRIPTION_REQUIRED', message: 'Your trial has ended' });
    expect((await failure(api('/x', { method: 'POST', body: {} }))).code).toBe('SUBSCRIPTION_REQUIRED');
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(SUBSCRIPTION_EVENT, listener);
  });

  it('returns undefined for 204 responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api('/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });
});
