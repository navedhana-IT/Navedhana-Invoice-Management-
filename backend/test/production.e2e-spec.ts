import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import type { AddressInfo } from 'net';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { api, bootApp, createMasterAdmin, login } from './helpers';

const PW = 'Str0ngPass!word';
const RUN = Date.now().toString(36);
const email = (name: string) => `${name}-${RUN}@test.local`;
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const token = () => randomBytes(24).toString('base64url');
const paidAt = () => new Date(Date.now() - 60_000).toISOString();

type Api = ReturnType<typeof api>;
type Tenant = { companyId: number; services: { id: number; code: string }[]; admin: Api; adminToken: string };

describe('Production pass (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let master: Api;
  const t: Record<'a' | 'b', Tenant> = {} as never;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await bootApp({ realtime: true }));
    await createMasterAdmin(prisma, email('master'), PW);
    master = api(app, (await login(app, email('master'), PW)).token);

    const codes = { a: ['LSP', 'NSS'], b: ['BSW', 'BSP'] };
    for (const key of ['a', 'b'] as const) {
      const res = await master
        .post('/admin/onboarding', {
          company: { legalName: `Prod ${key} ${RUN} Pvt Ltd`, displayName: `Prod ${key} ${RUN}` },
          admin: { fullName: `Admin ${key}`, email: email(`admin-${key}`), password: PW },
          services: codes[key].map((code) => ({ name: `${key} ${code}`, code })),
          activate: true,
        })
        .expect(201);
      const { token: adminToken } = await login(app, email(`admin-${key}`), PW);
      const services = res.body.services.map((s: { id: number }, i: number) => ({ id: s.id, code: codes[key][i] }));
      t[key] = { companyId: res.body.id, services, admin: api(app, adminToken, res.body.id), adminToken };
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  const role = async (key: string) => ((await t.a.admin.get('/roles').expect(200)).body as { id: number; key: string }[]).find((r) => r.key === key)!;

  describe('plans, signup and trial', () => {
    let planId: number;
    let owner: Api;
    let companyId: number;

    it('plan CRUD is reflected in /public/plans', async () => {
      const code = `E2E_${RUN.toUpperCase()}`.slice(0, 30);
      const plan = await master
        .post('/admin/plans', { code, name: 'E2E Starter', price: '499', trialDays: 14, features: ['1 brand'], limits: { maxServices: 1, maxUsers: 3 } })
        .expect(201);
      planId = plan.body.id;
      const pub = await http().get('/api/v1/public/plans').expect(200);
      expect(pub.body.map((p: { id: number }) => p.id)).toContain(planId);
      await master.patch(`/admin/plans/${planId}`, { name: 'E2E Starter+' }).expect(200);
      const again = await http().get('/api/v1/public/plans').expect(200);
      expect(again.body.find((p: { id: number }) => p.id === planId).name).toBe('E2E Starter+');
    });

    it('signs up on the plan trial and rejects duplicates', async () => {
      const body = {
        account: { fullName: 'Owner', email: email('owner'), password: PW },
        company: { legalName: `Signup ${RUN} Pvt Ltd`, displayName: `Signup ${RUN}` },
        service: { name: 'Signup Brand', code: 'SGB' },
        planId,
        acceptTerms: true,
      };
      const res = await http().post('/api/v1/auth/signup').send(body).expect(201);
      expect(res.body.accessToken).toBeDefined();
      companyId = res.body.companyId;
      owner = api(app, res.body.accessToken, companyId);

      const dup = await http().post('/api/v1/auth/signup').send({ ...body, company: { legalName: 'Other', displayName: `Other ${RUN}` } }).expect(409);
      expect(dup.body.code).toBe('EMAIL_TAKEN');

      const ctx = await owner.get('/me/context').expect(200);
      expect(ctx.body.company.subscriptionStatus).toBe('TRIALING');
      expect(ctx.body.company.readOnly).toBe(false);
      expect(new Date(ctx.body.company.trialEndsAt).getTime()).toBeGreaterThan(Date.now() + 13 * 86_400_000);
    });

    it('enforces plan limits', async () => {
      const res = await owner.post('/services', { name: 'Second brand', code: 'SG2' }).expect(403);
      expect(res.body.message).toMatch(/plan allows 1 services/);
    });

    it('a lapsed trial makes the workspace read-only until activated', async () => {
      await prisma.company.update({ where: { id: companyId }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
      const blocked = await owner.post('/customers', { name: 'Late customer' }).expect(402);
      expect(blocked.body.code).toBe('SUBSCRIPTION_REQUIRED');
      await owner.get('/customers').expect(200);
      expect((await owner.get('/me/context').expect(200)).body.company.readOnly).toBe(true);

      await master.patch(`/admin/companies/${companyId}/subscription`, { subscriptionStatus: 'ACTIVE' }).expect(200);
      await owner.post('/customers', { name: 'Paid customer' }).expect(201);
    });

    it('deactivated plans disappear from pricing and signup', async () => {
      await master.post(`/admin/plans/${planId}/deactivate`).expect(200);
      const pub = await http().get('/api/v1/public/plans').expect(200);
      expect(pub.body.map((p: { id: number }) => p.id)).not.toContain(planId);
      const res = await http()
        .post('/api/v1/auth/signup')
        .send({
          account: { fullName: 'Late', email: email('late'), password: PW },
          company: { legalName: `Late ${RUN}`, displayName: `Late ${RUN}` },
          service: { name: 'Late Brand', code: 'LTB' },
          planId,
          acceptTerms: true,
        })
        .expect(400);
      expect(res.body.code).toBe('PLAN_UNAVAILABLE');
    });
  });

  describe('invitations and password reset', () => {
    const inviteWithToken = async (who: string, extra: object = {}) => {
      const employee = await role('employee');
      const res = await t.a.admin
        .post('/invitations', { email: email(who), fullName: who, roleIds: [employee.id], serviceIds: [t.a.services[0].id], ...extra })
        .expect(201);
      const tok = token();
      await prisma.invitation.update({ where: { id: res.body.id }, data: { tokenHash: sha256(tok) } });
      return { id: res.body.id as number, tok };
    };

    it('accepts once, then rejects reuse', async () => {
      const { tok } = await inviteWithToken('invitee');
      const look = await http().get(`/api/v1/invitations/lookup?token=${tok}`).expect(200);
      expect(look.body).toMatchObject({ email: email('invitee'), accountExists: false });

      const acc = await http().post('/api/v1/invitations/accept').send({ token: tok, fullName: 'Invitee', password: PW }).expect(200);
      expect(acc.body.companyId).toBe(t.a.companyId);
      const invitee = api(app, acc.body.accessToken, t.a.companyId);
      const ctx = await invitee.get('/me/context').expect(200);
      expect(ctx.body.services.map((s: { id: number }) => s.id)).toEqual([t.a.services[0].id]);
      await invitee.get('/users').expect(403);

      const reuse = await http().post('/api/v1/invitations/accept').send({ token: tok, fullName: 'Again', password: PW }).expect(409);
      expect(reuse.body.code).toBe('INVITATION_USED');
    });

    it('rejects expired and revoked invitations with 410', async () => {
      const expired = await inviteWithToken('expired');
      await prisma.invitation.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      expect((await http().get(`/api/v1/invitations/lookup?token=${expired.tok}`).expect(410)).body.code).toBe('INVITATION_EXPIRED');

      const revoked = await inviteWithToken('revoked');
      await t.a.admin.delete(`/invitations/${revoked.id}`).expect(204);
      expect((await http().post('/api/v1/invitations/accept').send({ token: revoked.tok, fullName: 'Revoked', password: PW }).expect(410)).body.code).toBe('INVITATION_REVOKED');
    });

    it('cannot invite someone into a role with more permissions than the inviter', async () => {
      const recruiterRole = await t.a.admin.post('/roles', { name: `Recruiter ${RUN}`, permissions: ['user.view', 'user.create'] }).expect(201);
      await t.a.admin.post('/users', { email: email('recruiter'), fullName: 'Recruiter', password: PW, roles: [{ roleId: recruiterRole.body.id }] }).expect(201);
      const recruiter = api(app, (await login(app, email('recruiter'), PW)).token, t.a.companyId);
      const admin = await role('company_admin');
      await recruiter.post('/invitations', { email: email('escalate'), fullName: 'Esc', roleIds: [admin.id] }).expect(403);
    });

    it('resets a password with a single-use token', async () => {
      await http().post('/api/v1/auth/forgot-password').send({ email: email('recruiter') }).expect(200);
      const user = await prisma.user.findUniqueOrThrow({ where: { email: email('recruiter') } });
      const row = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: user.id, usedAt: null } });
      const tok = token();
      await prisma.passwordResetToken.update({ where: { id: row.id }, data: { tokenHash: sha256(tok) } });

      const NEW = 'An0ther!Passw0rd';
      await http().post('/api/v1/auth/reset-password').send({ token: tok, password: NEW }).expect(200);
      await http().post('/api/v1/auth/reset-password').send({ token: tok, password: NEW }).expect(400);
      await http().post('/api/v1/auth/login').send({ email: email('recruiter'), password: PW }).expect(401);
      const { cookie } = await login(app, email('recruiter'), NEW);

      // Parallel refreshes with one cookie (two tabs, or an aborted response) both succeed.
      const refresh = (c: string[]) => http().post('/api/v1/auth/refresh').set('Cookie', c);
      const [first, second] = await Promise.all([refresh(cookie), refresh(cookie)]);
      expect([first.status, second.status]).toEqual([200, 200]);
      await refresh(second.headers['set-cookie'] as unknown as string[]).expect(200);

      // After logout nothing in the family is reusable, even inside the reuse interval.
      await http().post('/api/v1/auth/logout').set('Cookie', first.headers['set-cookie'] as unknown as string[]);
      await refresh(cookie).expect(401);
    });
  });

  describe('numbering', () => {
    let customerId: number;
    const draft = (serviceId: number) =>
      t.a.admin
        .post('/invoices', { serviceId, invoiceType: 'SALES', customerId, taxMode: 'NONE', items: [{ description: 'Work', quantity: '1', unitPrice: '100' }] })
        .expect(201)
        .then((r) => r.body.id as number);

    beforeAll(async () => {
      customerId = (await t.a.admin.post('/customers', { name: 'Numbering customer', email: 'buyer@test.local' }).expect(201)).body.id;
    });

    it('keeps each brand on its own sequence', async () => {
      const [lsp, nss] = t.a.services;
      const a = await t.a.admin.post(`/invoices/${await draft(lsp.id)}/issue`).expect(200);
      const b = await t.a.admin.post(`/invoices/${await draft(nss.id)}/issue`).expect(200);
      expect(a.body.invoiceNumber).toBe('LSP-INV-000001');
      expect(b.body.invoiceNumber).toBe('NSS-INV-000001');
    });

    it('issues 20 invoices concurrently without duplicates or gaps', async () => {
      const ids: number[] = [];
      for (let i = 0; i < 20; i++) ids.push(await draft(t.a.services[0].id));
      const results = await Promise.all(ids.map((id) => t.a.admin.post(`/invoices/${id}/issue`)));
      expect(results.map((r) => r.status)).toEqual(Array(20).fill(200));
      const numbers = results.map((r) => r.body.invoiceNumber as string).sort();
      expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => `LSP-INV-${String(i + 2).padStart(6, '0')}`));
    });

    it('applies a custom format and rejects invalid ones', async () => {
      const nss = t.a.services[1];
      await t.a.admin.patch(`/services/${nss.id}`, { numbering: { INVOICE: { format: '{CODE}/INV' } } }).expect(400);
      await t.a.admin.patch(`/services/${nss.id}`, { numbering: { PROFORMA: { format: '{CODE}-INV-{SEQ}' } } }).expect(400);
      await t.a.admin.patch(`/services/${nss.id}`, { numbering: { INVOICE: { format: '{CODE}/{YYYY}/{SEQ}', padding: 4 } } }).expect(200);
      const preview = await t.a.admin.post(`/services/${nss.id}/numbering/preview`, {}).expect(200);
      expect(preview.body.INVOICE).toBe(`NSS/${new Date().getFullYear()}/0002`);
      await t.a.admin.patch(`/services/${nss.id}`, { code: 'NS2' }).expect(409);
    });
  });

  describe('payables and receivables', () => {
    it('vendor bill: schedule, partial and full payment with voucher numbers', async () => {
      const a = t.a;
      const vendor = await a.admin.post('/vendors', { name: 'Panel supplier' }).expect(201);
      const bill = await a.admin
        .post('/invoices', {
          serviceId: a.services[0].id, invoiceType: 'PURCHASE', vendorId: vendor.body.id, externalNumber: 'SUP-778', taxMode: 'NONE',
          items: [{ description: 'Panels', quantity: '10', unitPrice: '5000' }],
          schedule: [
            { description: 'Advance', amount: '20000', dueType: 'FIXED', dueDate: '2099-01-10' },
            { description: 'Balance', amount: '30000', dueType: 'FIXED', dueDate: '2099-02-10' },
          ],
        })
        .expect(201);
      const issued = await a.admin.post(`/invoices/${bill.body.id}/issue`).expect(200);
      expect(issued.body).toMatchObject({ direction: 'PAYABLE', status: 'RECEIVED', invoiceNumber: 'LSP-PUR-000001' });

      const p1 = await a.admin.post(`/invoices/${bill.body.id}/payments`, { amount: '20000', method: 'BANK_TRANSFER', paidAt: paidAt() }).expect(201);
      expect(p1.body.receiptNumber).toBe('LSP-PV-000001');
      expect((await a.admin.get(`/invoices/${bill.body.id}`).expect(200)).body).toMatchObject({ status: 'PARTIALLY_PAID', balanceAmount: '30000' });

      const p2 = await a.admin.post(`/invoices/${bill.body.id}/payments`, { amount: '30000', method: 'UPI', paidAt: paidAt() }).expect(201);
      expect(p2.body.receiptNumber).toBe('LSP-PV-000002');
      expect((await a.admin.get(`/invoices/${bill.body.id}`).expect(200)).body).toMatchObject({ status: 'PAID', balanceAmount: '0' });

      const list = await a.admin.get('/payments?direction=PAYABLE').expect(200);
      expect(list.body.summary.successTotal).toBe('50000.00');
    });

    it('3,00,000 receivable: 1,00,000 then 2,00,000 with receipt numbers', async () => {
      const a = t.a;
      const customer = await a.admin.post('/customers', { name: 'Rooftop customer' }).expect(201);
      const inv = await a.admin
        .post('/invoices', {
          serviceId: a.services[1].id, invoiceType: 'TAX', customerId: customer.body.id, taxMode: 'NONE',
          items: [{ description: 'Rooftop plant', quantity: '1', unitPrice: '300000' }],
          schedule: [
            { description: 'Stage 1', amount: '100000', dueType: 'FIXED', dueDate: '2099-10-10' },
            { description: 'Stage 2', amount: '200000', dueType: 'FIXED', dueDate: '2099-11-10' },
          ],
        })
        .expect(201);
      await a.admin.post(`/invoices/${inv.body.id}/issue`).expect(200);
      const r1 = await a.admin.post(`/invoices/${inv.body.id}/payments`, { amount: '100000', method: 'UPI', paidAt: paidAt() }).expect(201);
      expect(r1.body.receiptNumber).toBe('NSS-RCT-000001');
      expect((await a.admin.get(`/invoices/${inv.body.id}`).expect(200)).body.status).toBe('PARTIALLY_PAID');
      const r2 = await a.admin.post(`/invoices/${inv.body.id}/payments`, { amount: '200000', method: 'BANK_TRANSFER', paidAt: paidAt() }).expect(201);
      expect(r2.body.receiptNumber).toBe('NSS-RCT-000002');
      expect((await a.admin.get(`/invoices/${inv.body.id}`).expect(200)).body).toMatchObject({ status: 'PAID', balanceAmount: '0' });
    });

    it('splits GST by state: IGST across states, CGST + SGST within', async () => {
      const a = t.a;
      await a.admin.patch(`/services/${a.services[0].id}`, { state: 'Karnataka' }).expect(200);
      const kerala = await a.admin.post('/customers', { name: 'Kerala buyer', state: 'Kerala' }).expect(201);
      const local = await a.admin.post('/customers', { name: 'Local buyer', state: 'karnataka' }).expect(201);
      const make = (customerId: number) =>
        a.admin.post('/invoices', { serviceId: a.services[0].id, invoiceType: 'TAX', customerId, items: [{ description: 'x', quantity: '1', unitPrice: '1000', taxRate: '18' }] }).expect(201);
      const inter = (await make(kerala.body.id)).body;
      const intra = (await make(local.body.id)).body;
      expect(inter).toMatchObject({ taxMode: 'INTER_STATE', total: '1180' });
      expect(inter.items[0]).toMatchObject({ igst: '180', cgst: '0', sgst: '0' });
      expect(intra).toMatchObject({ taxMode: 'INTRA_STATE', total: '1180' });
      expect(intra.items[0]).toMatchObject({ cgst: '90', sgst: '90', igst: '0' });
    });
  });

  describe('cross-tenant access', () => {
    const ids: Record<string, number> = {};

    beforeAll(async () => {
      const b = t.b;
      const svc = b.services[0].id;
      ids.customer = (await b.admin.post('/customers', { name: 'B cust' }).expect(201)).body.id;
      ids.vendor = (await b.admin.post('/vendors', { name: 'B vendor' }).expect(201)).body.id;
      ids.product = (await b.admin.post('/products', { name: 'B product', unitPrice: '10' }).expect(201)).body.id;
      ids.department = (await b.admin.post('/departments', { name: 'B dept' }).expect(201)).body.id;
      ids.employee = (await b.admin.post('/employees', { fullName: 'B emp' }).expect(201)).body.id;
      const inv = await b.admin
        .post('/invoices', { serviceId: svc, invoiceType: 'SALES', customerId: ids.customer, taxMode: 'NONE', items: [{ description: 'x', quantity: '1', unitPrice: '100' }] })
        .expect(201);
      ids.invoice = inv.body.id;
      await b.admin.post(`/invoices/${ids.invoice}/issue`).expect(200);
      ids.payment = (await b.admin.post(`/invoices/${ids.invoice}/payments`, { amount: '10', method: 'CASH', paidAt: paidAt() }).expect(201)).body.id;
      ids.template = (await b.admin.get('/invoice-templates').expect(200)).body[0].id;
      ids.customField = (await b.admin.post('/custom-fields', { serviceId: svc, key: 'po_number', label: 'PO', type: 'TEXT' }).expect(201)).body.id;
      ids.service = svc;
      const employee = ((await b.admin.get('/roles').expect(200)).body as { id: number; key: string }[]).find((r) => r.key === 'employee')!;
      ids.invitation = (await b.admin.post('/invitations', { email: email('b-invitee'), fullName: 'B inv', roleIds: [employee.id] }).expect(201)).body.id;
      ids.document = Number((await prisma.document.create({
        data: { companyId: b.companyId, serviceId: svc, kind: 'OTHER', storageKey: `companies/${b.companyId}/services/${svc}/assets/${RUN}.png`, fileName: 'b.png', mimeType: 'image/png', size: 10 },
      })).id);
    });

    it('returns 404 for every resource type of another company', async () => {
      const a = t.a.admin;
      const reads = [
        `/customers/${ids.customer}`, `/vendors/${ids.vendor}`, `/products/${ids.product}`, `/departments/${ids.department}`,
        `/employees/${ids.employee}`, `/invoices/${ids.invoice}`, `/invoices/${ids.invoice}/payment-schedule`, `/invoices/${ids.invoice}/payments`,
        `/payments/${ids.payment}`, `/payments/${ids.payment}/pdf`, `/invoice-templates/${ids.template}`, `/services/${ids.service}`,
        `/documents/${ids.document}/url`, `/invoices/${ids.invoice}/pdf`,
      ];
      for (const path of reads) {
        const res = await a.get(path);
        expect([path, res.status]).toEqual([path, 404]);
      }
      const writes: [string, () => request.Test][] = [
        ['patch customer', () => a.patch(`/customers/${ids.customer}`, { name: 'hijack' })],
        ['delete vendor', () => a.delete(`/vendors/${ids.vendor}`)],
        ['patch invoice', () => a.patch(`/invoices/${ids.invoice}`, { notes: 'x' })],
        ['send invoice', () => a.post(`/invoices/${ids.invoice}/send`, {})],
        ['reverse payment', () => a.post(`/payments/${ids.payment}/reverse`, { reason: 'hijack' })],
        ['duplicate template', () => a.post(`/invoice-templates/${ids.template}/duplicate`, {})],
        ['delete template', () => a.delete(`/invoice-templates/${ids.template}`)],
        ['patch custom field', () => a.patch(`/custom-fields/${ids.customField}`, { label: 'x' })],
        ['patch service', () => a.patch(`/services/${ids.service}`, { name: 'x' })],
        ['resend invitation', () => a.post(`/invitations/${ids.invitation}/resend`)],
        ['revoke invitation', () => a.delete(`/invitations/${ids.invitation}`)],
      ];
      for (const [name, call] of writes) {
        const res = await call();
        expect([name, res.status]).toEqual([name, 404]);
      }
      // Lists never leak the other company's rows.
      const payments = await a.get('/payments?limit=100').expect(200);
      expect(payments.body.data.some((p: { id: number }) => p.id === ids.payment)).toBe(false);
    });

    it('a restricted member cannot reach another service of the same company', async () => {
      const a = t.a;
      const employee = await role('employee');
      await a.admin.post('/users', { email: email('svc-emp'), fullName: 'Svc emp', password: PW, roles: [{ roleId: employee.id, serviceId: a.services[0].id }] }).expect(201);
      const emp = api(app, (await login(app, email('svc-emp'), PW)).token, a.companyId);
      const other = await a.admin
        .post('/invoices', { serviceId: a.services[1].id, invoiceType: 'SALES', customerId: (await a.admin.post('/customers', { name: 'Other svc' }).expect(201)).body.id, taxMode: 'NONE', items: [{ description: 'x', quantity: '1', unitPrice: '1' }] })
        .expect(201);
      await emp.get(`/invoices/${other.body.id}`).expect(404);
      await emp.get(`/services/${a.services[1].id}`).expect(404);
      const list = await emp.get('/invoices?limit=100').expect(200);
      expect(list.body.data.every((i: { service: { name: string } }) => i.service.name === `a ${a.services[0].code}`)).toBe(true);
    });

    it("templates can't reference another company's images", async () => {
      const a = t.a;
      const tpl = (await a.admin.get('/invoice-templates').expect(200)).body.find((x: { serviceId: number }) => x.serviceId === a.services[0].id);
      const full = await a.admin.get(`/invoice-templates/${tpl.id}`).expect(200);
      const config = full.body.versions[0].config;
      const foreignKey = `companies/${t.b.companyId}/services/${ids.service}/assets/${RUN}.png`;
      config.sections.push({ id: 'img1', type: 'custom_image', width: 'half', props: { imageKey: foreignKey } });
      await a.admin.post(`/invoice-templates/${tpl.id}/versions`, { config }).expect(400);
      await a.admin.post('/documents/sign', { key: foreignKey }).expect(404);
    });
  });

  describe('notifications and realtime', () => {
    const sockets: Socket[] = [];
    const url = () => `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    const connect = (tok: string) =>
      new Promise<{ socket: Socket; events: { name: string; payload: Record<string, unknown> }[] }>((resolve, reject) => {
        const socket = io(url(), { auth: { token: tok }, transports: ['websocket'], forceNew: true });
        const events: { name: string; payload: Record<string, unknown> }[] = [];
        socket.onAny((name, payload) => events.push({ name, payload }));
        socket.on('connect', () => resolve({ socket, events }));
        socket.on('connect_error', reject);
        sockets.push(socket);
      });
    const waitFor = async (check: () => boolean, ms = 5000) => {
      const end = Date.now() + ms;
      while (!check() && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
      return check();
    };

    afterAll(() => sockets.forEach((s) => s.close()));

    it('rejects sockets without a valid token', async () => {
      const { events } = await connect('not-a-token');
      expect(await waitFor(() => events.some((e) => e.name === 'unauthorized'))).toBe(true);
    });

    it('delivers payment events only to the right users', async () => {
      const a = t.a;
      const finance = await role('finance_manager');
      await a.admin.post('/users', { email: email('fin'), fullName: 'Finance', password: PW, roles: [{ roleId: finance.id }], serviceIds: [a.services[0].id] }).expect(201);
      const finToken = (await login(app, email('fin'), PW)).token;

      const fin = await connect(finToken);
      const actor = await connect(a.adminToken);
      const outsider = await connect(t.b.adminToken);
      await new Promise((r) => setTimeout(r, 500)); // room joins finish after the handshake

      const customer = await a.admin.post('/customers', { name: 'RT customer' }).expect(201);
      const inv = await a.admin
        .post('/invoices', { serviceId: a.services[0].id, invoiceType: 'SALES', customerId: customer.body.id, taxMode: 'NONE', items: [{ description: 'x', quantity: '1', unitPrice: '500' }] })
        .expect(201);
      await a.admin.post(`/invoices/${inv.body.id}/issue`).expect(200);
      await a.admin.post(`/invoices/${inv.body.id}/payments`, { amount: '200', method: 'CASH', paidAt: paidAt() }).expect(201);
      expect(await waitFor(() => fin.events.some((e) => e.name === 'notification' && e.payload.type === 'PAYMENT_RECEIVED'))).toBe(true);
      expect(await waitFor(() => actor.events.some((e) => e.name === 'invoice.updated' && e.payload.invoiceId === inv.body.id))).toBe(true);
      const updated = actor.events.find((e) => e.name === 'invoice.updated' && e.payload.invoiceId === inv.body.id)!;
      expect(updated.payload).toMatchObject({ companyId: a.companyId, status: 'PARTIALLY_PAID', balanceAmount: '300.00' });
      // The actor isn't notified about their own action, and the other company hears nothing.
      expect(actor.events.some((e) => e.name === 'notification' && e.payload.type === 'PAYMENT_RECEIVED')).toBe(false);
      expect(outsider.events.filter((e) => e.name !== 'unauthorized')).toEqual([]);

      const finApi = api(app, finToken, a.companyId);
      const count = await finApi.get('/notifications/unread-count').expect(200);
      expect(count.body.count).toBeGreaterThanOrEqual(1);
      const list = await finApi.get('/notifications?unread=true').expect(200);
      const n = list.body.data.find((x: { type: string }) => x.type === 'PAYMENT_RECEIVED');
      await t.b.admin.post(`/notifications/${n.id}/read`).expect(404);
      await finApi.post(`/notifications/${n.id}/read`).expect(200);
      await finApi.post('/notifications/read-all').expect(200);
      expect((await finApi.get('/notifications/unread-count').expect(200)).body.count).toBe(0);
    });
  });

  describe('invoice email', () => {
    it('validates state and recipients before sending', async () => {
      const a = t.a;
      const noEmail = await a.admin.post('/customers', { name: 'No email' }).expect(201);
      const inv = await a.admin
        .post('/invoices', { serviceId: a.services[0].id, invoiceType: 'SALES', customerId: noEmail.body.id, taxMode: 'NONE', items: [{ description: 'x', quantity: '1', unitPrice: '10' }] })
        .expect(201);
      await a.admin.post(`/invoices/${inv.body.id}/send`, {}).expect(409);
      await a.admin.post(`/invoices/${inv.body.id}/issue`).expect(200);
      await a.admin.post(`/invoices/${inv.body.id}/send`, {}).expect(400);
      await a.admin.post(`/invoices/${inv.body.id}/send`, { to: ['not-an-email'] }).expect(400);
    });

    it('renders the PDF and queues the email', async () => {
      const a = t.a;
      const c = await a.admin.post('/customers', { name: 'Mail me', email: 'mailme@test.local' }).expect(201);
      const inv = await a.admin
        .post('/invoices', { serviceId: a.services[0].id, invoiceType: 'SALES', customerId: c.body.id, taxMode: 'NONE', items: [{ description: 'x', quantity: '1', unitPrice: '10' }] })
        .expect(201);
      await a.admin.post(`/invoices/${inv.body.id}/issue`).expect(200);
      const res = await a.admin.post(`/invoices/${inv.body.id}/send`, { cc: ['accounts@test.local'], message: 'Thanks!' }).expect(202);
      expect(res.body).toEqual({ queued: true, to: ['mailme@test.local'] });
      const audit = await a.admin.get('/audit-logs?limit=20').expect(200);
      expect(audit.body.data.map((x: { action: string }) => x.action)).toContain('INVOICE_SENT');
    }, 60_000);
  });

  describe('platform users', () => {
    it('master admin can deactivate and reactivate a user', async () => {
      const list = await master.get(`/admin/users?search=${encodeURIComponent(email('fin'))}`).expect(200);
      const user = list.body.data.find((u: { email: string }) => u.email === email('fin'));
      await master.patch(`/admin/users/${user.id}/status`, { status: 'INACTIVE' }).expect(200);
      await http().post('/api/v1/auth/login').send({ email: email('fin'), password: PW }).expect(401);
      await master.patch(`/admin/users/${user.id}/status`, { status: 'ACTIVE' }).expect(200);
      await t.a.admin.get('/admin/users').expect(403);
    });
  });
});
