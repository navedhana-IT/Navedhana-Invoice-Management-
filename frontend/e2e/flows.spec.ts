import { expect, test, type Page } from '@playwright/test';
import { latestEmail, login, masterCredentials, newWorkspace, PASSWORD, uniq } from './helpers';

test.describe.configure({ mode: 'serial' });

const ws = newWorkspace();
let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
});
test.afterAll(async () => page.close());

test('signup wizard creates a workspace on the trial', async () => {
  await page.goto('/signup');
  await page.getByLabel('Work email').fill(ws.email);
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Company' })).toBeVisible();
  await page.getByLabel('Registered company name').fill(`${ws.company} Pvt Ltd`);
  await page.getByLabel('Short name').fill(ws.company);
  await page.getByLabel('State').selectOption('Karnataka');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Administrator' })).toBeVisible();
  await page.getByLabel('Full name').fill('E2E Owner');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'First brand' })).toBeVisible();
  await page.getByLabel('Brand or service name').fill(ws.brand);
  await page.getByLabel('Brand code').fill(ws.code);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Branding' })).toBeVisible();
  await page.getByRole('button', { name: /Use colours #0f172a/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Invoicing' })).toBeVisible();
  await page.getByLabel('This brand is registered under GST').uncheck();
  await expect(page.getByText(`${ws.code}-INV-000001`).filter({ visible: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible();
  await page.getByText('I agree to the terms').click();
  await page.getByRole('button', { name: 'Create my workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Your workspace is ready' })).toBeVisible();
  await page.waitForURL(/\/app$/);
});

test('company admin: customer, invoice, schedule, issue, payment, template', async () => {
  const customer = uniq('Customer');
  await page.goto('/app/customers');
  await page.getByRole('button', { name: /New customer|Add your first customer/ }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(customer);
  await dialog.getByLabel('Email').fill(`${customer.toLowerCase()}@example.test`);
  await dialog.getByLabel('State').fill('Kerala');
  await dialog.getByRole('button', { name: 'Add customer' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(customer).filter({ visible: true }).first()).toBeVisible();

  await page.goto('/app/invoices/new');
  await page.getByRole('combobox').filter({ hasText: /Search customers/ }).click();
  await page.getByRole('option', { name: new RegExp(customer) }).click();
  await page.getByPlaceholder('Description *').fill('Solar installation');
  await page.getByLabel('Qty').fill('2');
  await page.getByLabel('Rate (₹)').fill('50000');
  await page.getByLabel('GST', { exact: true }).selectOption('18');
  await expect(page.getByText('Estimate · IGST (auto)', { exact: false })).toBeVisible();
  await expect(page.getByText('IGST', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await page.waitForURL(/\/app\/invoices\/[\w-]+$/);
  await expect(page.getByRole('heading', { name: /Draft invoice/ })).toBeVisible();

  await page.getByRole('button', { name: 'Add stages' }).click();
  const schedule = page.getByRole('dialog', { name: 'Payment schedule' });
  await schedule.getByLabel('Stage 1 amount').fill('50000');
  await schedule.getByLabel('Stage 1 due date').fill('2099-01-10');
  await schedule.getByRole('button', { name: 'Add stage' }).click();
  await expect(schedule.getByLabel('Stage 2 amount')).toHaveValue('68000.00');
  await schedule.getByRole('button', { name: 'Save schedule' }).click();
  await expect(schedule).toBeHidden();

  await page.getByRole('button', { name: 'Issue', exact: true }).click();
  await page.getByRole('button', { name: 'Issue now' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`${ws.code}-INV-000001`) })).toBeVisible();

  await page.getByRole('button', { name: 'Record payment' }).first().click();
  const pay = page.getByRole('dialog', { name: 'Record payment' });
  await pay.getByLabel('Amount (₹) *').fill('50000');
  await pay.getByRole('button', { name: 'Record payment' }).click();
  await expect(pay).toBeHidden();
  await expect(page.getByText('Partially paid').filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(`${ws.code}-RCT-000001`).filter({ visible: true }).first()).toBeVisible();

  await page.goto('/app/templates');
  await expect(page.getByRole('heading', { name: 'Invoice templates' })).toBeVisible();
  await expect(page.getByText(ws.brand).filter({ visible: true }).first()).toBeVisible();
});

test('employee invite: email link, accept, restricted navigation', async ({ browser }) => {
  const invitee = `${uniq('emp')}@example.test`;
  await page.goto('/app/users');
  await page.getByRole('button', { name: 'Invite member' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Full name').fill('E2E Employee');
  await dialog.getByLabel('Email').fill(invitee);
  await dialog.getByLabel('Employee', { exact: true }).check();
  await dialog.getByLabel(ws.brand).check();
  await dialog.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByText(`Invitation sent to ${invitee}`)).toBeVisible();

  const mail = await latestEmail(page.request, invitee);
  const link = mail.text.match(/https?:\/\/[^\s"'<>]+\/invite\/[A-Za-z0-9_-]+/)?.[0];
  expect(link, 'invitation link in email').toBeTruthy();

  const ctx = await browser.newContext();
  const emp = await ctx.newPage();
  await emp.goto(new URL(link!).pathname);
  await expect(emp.getByRole('heading', { name: `Join ${ws.company}` })).toBeVisible();
  await emp.getByRole('textbox', { name: 'Password', exact: true }).fill(PASSWORD);
  await emp.getByLabel('Confirm password').fill(PASSWORD);
  await emp.getByRole('button', { name: 'Create account and join' }).click();
  await emp.waitForURL(/\/app$/);

  const sidebar = emp.locator('aside');
  await expect(sidebar.getByRole('link', { name: 'Sales invoices' })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Members' })).toHaveCount(0);
  await expect(sidebar.getByRole('link', { name: 'Payments' })).toHaveCount(0);

  await emp.goto('/app/users');
  await expect(emp.getByText('You don’t have access to this').filter({ visible: true }).first()).toBeVisible();
  const res = await emp.request.get('/api/v1/users');
  expect([401, 403]).toContain(res.status());
  await ctx.close();
});

test('master admin onboards and activates a company', async ({ browser }) => {
  const creds = masterCredentials();
  test.skip(!creds, 'Set E2E_MASTER_EMAIL and E2E_MASTER_PASSWORD');
  const ctx = await browser.newContext();
  const admin = await ctx.newPage();
  await login(admin, creds!.email, creds!.password, '/admin');
  await admin.waitForURL(/\/admin/);

  const name = uniq('Onboarded');
  await admin.goto('/admin/onboarding');
  await admin.getByLabel('Legal name *').fill(`${name} Pvt Ltd`);
  await admin.getByLabel('Display name *').fill(name);
  await admin.getByRole('button', { name: 'Continue' }).click();
  await admin.locator('form button[type="button"]').filter({ hasText: /brands ·/ }).first().click();
  await admin.getByRole('button', { name: 'Continue' }).click();
  await admin.getByLabel('Full name *').fill('Onboarded Admin');
  await admin.getByLabel('Email *').fill(`${name.toLowerCase()}@example.test`);
  await admin.getByLabel('Initial password').fill(PASSWORD);
  await admin.getByRole('button', { name: 'Continue' }).click();
  await admin.getByLabel('Brand name *').fill(`${name} Brand`);
  for (let i = 0; i < 3; i++) await admin.getByRole('button', { name: 'Continue' }).click();
  await admin.getByLabel(/Activate immediately/).uncheck();
  await admin.getByRole('button', { name: 'Create company' }).click();
  await admin.waitForURL(/\/admin\/companies\/[\w-]+$/);

  await admin.getByRole('button', { name: 'Activate', exact: true }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Activate' }).click();
  await expect(admin.getByRole('button', { name: 'Deactivate' })).toBeVisible();
  // Admin-onboarded companies start on a paid subscription.
  await admin.getByRole('button', { name: /Expire/ }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Expire now' }).click();
  await admin.getByRole('button', { name: 'Mark as paid' }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Mark as paid' }).click();
  await expect(admin.getByText('Subscription marked as paid')).toBeVisible();
  await ctx.close();
});
