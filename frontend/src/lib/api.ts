/**
 * Browser API client. Calls go to same-origin /api/v1 (rewritten to NestJS by next.config.ts).
 * Access token lives in memory only; the httpOnly refresh cookie restores it after a reload.
 */
import { toId, type Id } from './ids';

const BASE = '/api/v1';
const KEYS = { company: 'nv.company', service: 'nv.service' } as const;

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

/** Mirrors the backend error envelope `{ statusCode, code, message, errors?, requestId }`. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public errors?: string[],
    public requestId?: string,
  ) {
    super(message);
  }
}

/** Fired when a write is refused because the trial/subscription lapsed (HTTP 402). */
export const SUBSCRIPTION_EVENT = 'nv:subscription-required';

export const tenant = {
  get companyId() { return get(KEYS.company); },
  get serviceId() { return get(KEYS.service); },
  setCompany(id: Id | null) { set(KEYS.company, id); set(KEYS.service, null); },
  setService(id: Id | null) { set(KEYS.service, id); },
};

/** Stored values from older builds (or tampered ones) aren't valid ids and are treated as unset. */
function get(key: string): Id | null {
  return typeof window === 'undefined' ? null : (toId(localStorage.getItem(key)) ?? null);
}

function set(key: string, v: Id | null) {
  if (v) localStorage.setItem(key, String(v));
  else localStorage.removeItem(key);
}

export const getAccessToken = () => accessToken;
export const setAccessToken = (t: string | null) => { accessToken = t; };

export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'same-origin' })
    .then(async (r) => {
      accessToken = r.ok ? (await r.json()).accessToken : null;
      return r.ok;
    })
    .catch(() => false)
    .finally(() => { refreshing = null; });
  return refreshing;
}

export async function login(email: string, password: string) {
  const r = await send(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!r.ok) throw await toError(r);
  accessToken = (await r.json()).accessToken;
}

export async function logout() {
  await fetch(`${BASE}/auth/logout`, { method: 'POST', headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} }).catch(() => undefined);
  accessToken = null;
  tenant.setCompany(null);
}

type Query = Record<string, string | number | boolean | undefined | null>;
type Opts = { method?: string; body?: unknown; query?: Query; form?: FormData; noService?: boolean; signal?: AbortSignal };

async function send(url: string, init: RequestInit) {
  try {
    return await fetch(url, init);
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'We couldn’t reach the server. Check your connection and try again.', 'NETWORK');
  }
}

export async function request(path: string, o: Opts = {}, retried = false): Promise<Response> {
  const qs = o.query ? new URLSearchParams(Object.entries(o.query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString() : '';
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (tenant.companyId) headers['X-Company-Id'] = String(tenant.companyId);
  if (tenant.serviceId && !o.noService) headers['X-Service-Id'] = String(tenant.serviceId);
  if (o.body !== undefined) headers['Content-Type'] = 'application/json';

  const r = await send(`${BASE}${path}${qs ? `?${qs}` : ''}`, {
    method: o.method ?? (o.body !== undefined || o.form ? 'POST' : 'GET'),
    headers,
    body: o.form ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined),
    signal: o.signal,
  });
  if (r.status === 401 && !retried && (await refreshSession())) return request(path, o, true);
  if (!r.ok) {
    const err = await toError(r);
    if (r.status === 402 && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SUBSCRIPTION_EVENT, { detail: err.message }));
    throw err;
  }
  return r;
}

export async function api<T = unknown>(path: string, o: Opts = {}): Promise<T> {
  const r = await request(path, o);
  if (r.status === 204) return undefined as T;
  return (r.headers.get('content-type') ?? '').includes('json') ? r.json() : (r.text() as Promise<T>);
}

/**
 * Opens an authenticated binary response (PDF) in a new tab without exposing storage URLs.
 * The tab is opened synchronously (popup blockers) and closed again if the request fails.
 */
export async function openBlob(path: string) {
  const win = window.open('', '_blank');
  try {
    const blob = await (await request(path)).blob();
    const url = URL.createObjectURL(blob);
    if (win && !win.closed) win.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    win?.close();
    throw e;
  }
}

/** Saves an authenticated binary response (CSV/PDF) with the given filename. */
export async function download(path: string, filename: string, query?: Query) {
  const blob = await (await request(path, { query })).blob();
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const FRIENDLY: Record<number, string> = {
  400: 'Some details need fixing. Please check the form and try again.',
  401: 'Your session has ended. Please sign in again.',
  402: 'Your trial has ended. Choose a plan to keep making changes.',
  403: 'You don’t have permission to do that.',
  404: 'We couldn’t find what you were looking for.',
  409: 'That conflicts with existing data.',
  413: 'That file is too large.',
  429: 'Too many attempts. Please wait a moment and try again.',
};

async function toError(r: Response) {
  const body = await r.json().catch(() => ({}) as Record<string, unknown>);
  const errors = Array.isArray(body.errors) ? (body.errors as string[]) : Array.isArray(body.message) ? (body.message as string[]) : undefined;
  const raw = typeof body.message === 'string' ? body.message : errors?.[0];
  const message = r.status >= 500 ? 'Something went wrong on our side. Please try again in a moment.' : raw || FRIENDLY[r.status] || 'The request could not be completed.';
  return new ApiError(r.status, message, typeof body.code === 'string' ? body.code : undefined, errors, (body.requestId as string) ?? r.headers.get('x-request-id') ?? undefined);
}

export type Page<T> = { data: T[]; meta: { page: number; limit: number; total: number } };
