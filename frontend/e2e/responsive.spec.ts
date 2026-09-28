import { expect, test, type Page } from '@playwright/test';
import { login, masterCredentials, newWorkspace, signupViaApi } from './helpers';

const WIDTHS = [320, 360, 375, 390, 414, 768, 820, 1024, 1280, 1440, 1536, 1920, 2560];
const PUBLIC = ['/', '/features', '/pricing', '/blog', '/contact', '/login', '/signup', '/forgot-password'];
const APP = [
  '/app', '/app/invoices', '/app/invoices/new', '/app/purchases', '/app/payments', '/app/customers', '/app/products',
  '/app/services', '/app/templates', '/app/reports', '/app/users', '/app/roles', '/app/settings', '/app/notifications', '/app/audit',
];
const ADMIN = ['/admin', '/admin/companies', '/admin/onboarding', '/admin/plans', '/admin/users', '/admin/audit'];
const OUT = 'test-results/responsive';

/** Elements wider than the viewport, for the failure message. */
const overflow = (page: Page) =>
  page.evaluate(() => {
    const vw = window.innerWidth;
    if (document.documentElement.scrollWidth <= vw) return null;
    const offenders = [...document.querySelectorAll('body *')]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > vw + 1; })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')} (${Math.round(el.getBoundingClientRect().right)}px)`);
    return { scrollWidth: document.documentElement.scrollWidth, vw, offenders };
  });

/** One load per route (session refresh is rate limited), then every width via resize. */
async function sweep(page: Page, routes: string[], failures: string[]) {
  for (const route of routes) {
    await page.setViewportSize({ width: WIDTHS[0], height: 800 });
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main, [role="main"]').first()).toBeVisible();
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width < 768 ? 800 : 1000 });
      await page.waitForTimeout(150);
      const o = await overflow(page);
      if (o) failures.push(`${width}px ${route}: scrollWidth ${o.scrollWidth} > ${o.vw} — ${o.offenders.join(', ')}`);
      await page.screenshot({ path: `${OUT}/${width}/${route.replace(/\//g, '_') || '_'}.png`, fullPage: true });
    }
  }
}

test('no horizontal overflow on any main route from 320px to 2560px', async ({ page, browser }) => {
  const failures: string[] = [];
  const ws = newWorkspace();
  const { accessToken, companyId } = await signupViaApi(page, ws);

  // Seed a customer and an issued invoice so lists and the detail page have content.
  const headers = { Authorization: `Bearer ${accessToken}`, 'X-Company-Id': String(companyId) };
  const ctx = await (await page.request.get('/api/v1/me/context', { headers })).json();
  const customer = await (await page.request.post('/api/v1/customers', { headers, data: { name: 'Sri Lakshmi Enterprises Private Limited (Bengaluru)', email: 'accounts@example.test', state: 'Kerala' } })).json();
  const invoice = await (await page.request.post('/api/v1/invoices', {
    headers,
    data: { serviceId: ctx.services[0].id, invoiceType: 'SALES', customerId: customer.id, items: [{ description: 'Rooftop solar installation — 10 kW on-grid system with net metering', quantity: '1', unitPrice: '425000', taxRate: '18' }] },
  })).json();
  await page.request.post(`/api/v1/invoices/${invoice.id}/issue`, { headers });

  await sweep(page, [...PUBLIC, ...APP, `/app/invoices/${invoice.id}`, `/app/services/${ctx.services[0].id}`], failures);

  const creds = masterCredentials();
  if (creds) {
    const admin = await (await browser.newContext()).newPage();
    await login(admin, creds.email, creds.password, '/admin');
    await admin.waitForURL(/\/admin/);
    await sweep(admin, ADMIN, failures);
  }
  expect(failures, failures.join('\n')).toEqual([]);
});
