import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

export const PASSWORD = 'E2e-Passw0rd!';
export const MAILPIT = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';
export const uniq = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Master admin credentials from E2E_MASTER_* or, locally, the backend's own .env. Never logged. */
export function masterCredentials() {
  if (process.env.E2E_MASTER_EMAIL && process.env.E2E_MASTER_PASSWORD) return { email: process.env.E2E_MASTER_EMAIL, password: process.env.E2E_MASTER_PASSWORD };
  const file = join(__dirname, '../../backend/.env');
  if (!existsSync(file)) return null;
  const env = parseEnv(readFileSync(file, 'utf8'));
  return env.MASTER_ADMIN_EMAIL && env.MASTER_ADMIN_PASSWORD ? { email: env.MASTER_ADMIN_EMAIL, password: env.MASTER_ADMIN_PASSWORD } : null;
}

export async function login(page: Page, email: string, password: string, next = '/app') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** Latest email to `to` in Mailpit, as plain text. */
export async function latestEmail(request: APIRequestContext, to: string) {
  let id: string | undefined;
  await expect.poll(async () => {
    const res = await request.get(`${MAILPIT}/api/v1/search`, { params: { query: `to:"${to}"`, limit: '1' } });
    id = (await res.json()).messages?.[0]?.ID;
    return id;
  }, { timeout: 30_000 }).toBeTruthy();
  const msg = await (await request.get(`${MAILPIT}/api/v1/message/${id}`)).json();
  return { subject: msg.Subject as string, text: `${msg.Text}\n${msg.HTML}` };
}

export type Workspace = { email: string; company: string; brand: string; code: string };

export function newWorkspace(): Workspace {
  const id = uniq('e2e');
  const code = `E${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  return { email: `${id}@example.test`, company: `Acme ${id}`, brand: `Acme Solar ${code}`, code };
}

/** Public signup through the API (for tests that only need a signed-in workspace). Sets the refresh cookie on `page`. */
export async function signupViaApi(page: Page, ws: Workspace) {
  const plans = await (await page.request.get('/api/v1/public/plans')).json();
  const payload = {
    account: { fullName: 'E2E Owner', email: ws.email, password: PASSWORD },
    company: { legalName: `${ws.company} Pvt Ltd`, displayName: ws.company, state: 'Karnataka', country: 'India' },
    service: { name: ws.brand, displayName: ws.brand, code: ws.code, state: 'Karnataka' },
    theme: { primaryColor: '#1e1b4b', accentColor: '#4f46e5' },
    planId: plans[0].id,
    acceptTerms: true,
  };
  const res = await page.request.post('/api/v1/auth/signup', { multipart: { payload: JSON.stringify(payload) } });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as { accessToken: string; companyId: number };
}
