import { expect, test } from '@playwright/test';
import { PASSWORD, login, newWorkspace, signupViaApi } from './helpers';

test('public pages are indexable and app pages are not', async ({ page, request }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Navedhana/);
  expect((await request.get('/sitemap.xml')).ok()).toBe(true);
  const login = await request.get('/login');
  expect(login.headers()['x-robots-tag']).toContain('noindex');
});

test('protected routes redirect to login', async ({ page }) => {
  await page.goto('/app/invoices');
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Finvoices/);
});

test('signs in and opens sales invoices', async ({ page }) => {
  const ws = newWorkspace();
  await signupViaApi(page, ws);
  await login(page, ws.email, PASSWORD, '/app/invoices');
  await expect(page.getByRole('heading', { name: 'Sales invoices' })).toBeVisible();
  await expect(page.getByRole('link', { name: /New invoice/ }).first()).toBeVisible();
});
