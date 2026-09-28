import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { api, bootApp, createMasterAdmin, login } from './helpers';

const PW = 'Str0ngPass!word';
const RUN = Date.now().toString(36);
const email = (name: string) => `${name}-${RUN}@test.local`;

describe('Platform (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let master: ReturnType<typeof api>;
  const tenants: Record<'a' | 'b', { companyId: number; services: { id: number; slug: string; code: string }[]; admin: ReturnType<typeof api> }> = {} as never;

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    await createMasterAdmin(prisma, email('master'), PW);
    master = api(app, (await login(app, email('master'), PW)).token);

    for (const key of ['a', 'b'] as const) {
      const res = await master
        .post('/admin/onboarding', {
          company: { legalName: `Company ${key} Pvt Ltd`, displayName: `Company ${key}` },
          admin: { fullName: `Admin ${key}`, email: email(`admin-${key}`), password: PW },
          services: [{ name: `${key} Software`, code: `${key.toUpperCase()}S` }, { name: `${key} Solar`, code: `${key.toUpperCase()}P` }],
          activate: true,
        })
        .expect(201);
      const { token } = await login(app, email(`admin-${key}`), PW);
      tenants[key] = { companyId: res.body.id, services: res.body.services, admin: api(app, token, res.body.id) };
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('auth', () => {
    it('rejects bad credentials and unauthenticated access', async () => {
      await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: email('master'), password: 'wrong-password' }).expect(401);
      await request(app.getHttpServer()).get('/api/v1/me').expect(401);
    });

    it('rotates refresh tokens and revokes the family on reuse', async () => {
      let rotatedAgain: string[] = [];
      const { cookie } = await login(app, email('admin-a'), PW);
      const r1 = await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', cookie).expect(200);
      expect(r1.body.accessToken).toBeDefined();
      const rotated = r1.headers['set-cookie'] as unknown as string[];
      await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', cookie).expect(200); // reuse inside the reuse interval
      await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', rotated).expect(200).then((r) => { rotatedAgain = r.headers['set-cookie'] as unknown as string[]; });

      // Reuse after the interval is treated as theft.
      const user = await prisma.user.findUniqueOrThrow({ where: { email: email('admin-a') } });
      await prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: { not: null } }, data: { revokedAt: new Date(Date.now() - 60_000) } });
      await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
      await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', rotatedAgain).expect(401); // family revoked
    });

    it('blocks non master admins from platform routes', async () => {
      await tenants.a.admin.get('/admin/companies').expect(403);
    });
  });

  describe('tenant isolation', () => {
    let invoiceB: number;

    beforeAll(async () => {
      const b = tenants.b;
      const customer = await b.admin.post('/customers', { name: 'B Customer' }).expect(201);
      const inv = await b.admin
        .post('/invoices', { serviceId: b.services[0].id, invoiceType: 'SALES', customerId: customer.body.id, items: [{ description: 'Work', quantity: '1', unitPrice: '1000' }] })
        .expect(201);
      invoiceB = inv.body.id;
    });

    it('company A cannot use company B context', async () => {
      const aAsB = api(app, (await login(app, email('admin-a'), PW)).token, tenants.b.companyId);
      await aAsB.get('/invoices').expect(404);
      await aAsB.get('/customers').expect(404);
    });

    it('company A cannot read B records by id, even with a valid own context', async () => {
      await tenants.a.admin.get(`/invoices/${invoiceB}`).expect(404);
      await tenants.a.admin.post(`/invoices/${invoiceB}/issue`).expect(404);
      await tenants.a.admin.post(`/invoices/${invoiceB}/payments`, { amount: '1', method: 'CASH', paidAt: new Date().toISOString() }).expect(404);
      const list = await tenants.a.admin.get('/invoices').expect(200);
      expect(list.body.data.find((i: { id: number }) => i.id === invoiceB)).toBeUndefined();
    });

    it('cannot link another company invoice as a reference', async () => {
      const c = await tenants.a.admin.post('/customers', { name: 'Ref Customer' }).expect(201);
      const inv = await tenants.a.admin
        .post('/invoices', { serviceId: tenants.a.services[0].id, invoiceType: 'SALES', customerId: c.body.id, referenceInvoiceId: invoiceB, items: [{ description: 'x', quantity: '1', unitPrice: '1' }] })
        .expect(201);
      expect(inv.body.referenceInvoice).toBeNull();
    });

    it('ignores companyId smuggled in the body', async () => {
      await tenants.a.admin.post('/customers', { name: 'X', companyId: tenants.b.companyId }).expect(400);
    });

    it('cannot create invoices for another company service', async () => {
      const c = await tenants.a.admin.post('/customers', { name: 'A Customer' }).expect(201);
      await tenants.a.admin
        .post('/invoices', { serviceId: tenants.b.services[0].id, invoiceType: 'SALES', customerId: c.body.id, items: [{ description: 'x', quantity: '1', unitPrice: '1' }] })
        .expect(404);
    });
  });

  describe('service-level authorization', () => {
    it('an employee assigned to one service only sees that service', async () => {
      const a = tenants.a;
      const roles = await a.admin.get('/roles').expect(200);
      const employeeRole = roles.body.find((r: { key: string }) => r.key === 'employee');
      const [software, solar] = a.services;
      await a.admin.post('/users', { email: email('emp-a'), fullName: 'Emp', password: PW, roles: [{ roleId: employeeRole.id, serviceId: software.id }] }).expect(201);
      const emp = api(app, (await login(app, email('emp-a'), PW)).token, a.companyId);

      const ctx = await emp.get('/me/context').expect(200);
      expect(ctx.body.services.map((s: { id: number }) => s.id)).toEqual([software.id]);
      await api(app, (await login(app, email('emp-a'), PW)).token, a.companyId, solar.id).get('/invoices').expect(404);
      await emp.post('/invoices/999999999/issue').expect(403);
      await emp.get('/users').expect(403);
    });

    it('prevents privilege escalation through role assignment', async () => {
      const a = tenants.a;
      const roles = await a.admin.get('/roles').expect(200);
      const finance = roles.body.find((r: { key: string }) => r.key === 'finance_manager');
      const admin = roles.body.find((r: { key: string }) => r.key === 'company_admin');
      await a.admin.post('/users', { email: email('fin-a'), fullName: 'Fin', password: PW, roles: [{ roleId: finance.id }] }).expect(201);
      // finance manager has no user.create, so cannot even try
      const fin = api(app, (await login(app, email('fin-a'), PW)).token, a.companyId);
      await fin.post('/users', { email: email('x'), fullName: 'X', password: PW, roles: [{ roleId: admin.id }] }).expect(403);
    });
  });

  describe('invoice + payment schedule + payments', () => {
    it('handles the 3,00,000 two-stage example end to end', async () => {
      const a = tenants.a;
      const customer = await a.admin.post('/customers', { name: 'Solar Customer' }).expect(201);
      const draft = await a.admin
        .post('/invoices', {
          serviceId: a.services.find((s) => s.code === 'AP')!.id, invoiceType: 'TAX', customerId: customer.body.id, taxMode: 'NONE',
          items: [{ description: 'Rooftop plant', quantity: '1', unitPrice: '300000' }],
          schedule: [
            { description: 'Stage 1', amount: '100000', dueType: 'FIXED', dueDate: '2099-10-10' },
            { description: 'Stage 2', amount: '200000', dueType: 'FIXED', dueDate: '2099-11-10' },
          ],
        })
        .expect(201);
      expect(draft.body.total).toBe('300000');
      const id = draft.body.id;

      // cannot pay a draft; cannot edit after issue
      await a.admin.post(`/invoices/${id}/payments`, { amount: '1', method: 'CASH', paidAt: new Date().toISOString() }).expect(409);
      const issued = await a.admin.post(`/invoices/${id}/issue`).expect(200);
      expect(issued.body.invoiceNumber).toBe('AP-INV-000001');
      expect(issued.body.status).toBe('ISSUED');
      expect(issued.body.brandingSnapshot.service.displayName).toBe('a Solar');
      await a.admin.patch(`/invoices/${id}`, { notes: 'x' }).expect(409);

      const paidAt = new Date(Date.now() - 60_000).toISOString();
      await a.admin.post(`/invoices/${id}/payments`, { amount: '0', method: 'UPI', paidAt }).expect(400);
      await a.admin.post(`/invoices/${id}/payments`, { amount: '300000.01', method: 'UPI', paidAt }).expect(400);
      await a.admin.post(`/invoices/${id}/payments`, { amount: '100000', method: 'UPI', paidAt }).expect(201);

      let inv = await a.admin.get(`/invoices/${id}`).expect(200);
      expect(inv.body.status).toBe('PARTIALLY_PAID');
      expect(inv.body.balanceAmount).toBe('200000');
      expect(inv.body.schedule.map((s: { status: string }) => s.status)).toEqual(['PAID', 'PENDING']);

      await a.admin.post(`/invoices/${id}/cancel`).expect(409); // has payments
      const p2 = await a.admin.post(`/invoices/${id}/payments`, { amount: '200000', method: 'BANK_TRANSFER', paidAt }).expect(201);
      inv = await a.admin.get(`/invoices/${id}`).expect(200);
      expect(inv.body.status).toBe('PAID');

      await a.admin.post(`/payments/${p2.body.id}/reverse`, { reason: 'Bounced' }).expect(200);
      inv = await a.admin.get(`/invoices/${id}`).expect(200);
      expect(inv.body.status).toBe('PARTIALLY_PAID');
      expect(inv.body.paidAmount).toBe('100000');

      const audit = await a.admin.get('/audit-logs?limit=50').expect(200);
      const actions = audit.body.data.map((x: { action: string }) => x.action);
      expect(actions).toEqual(expect.arrayContaining(['INVOICE_CREATED', 'INVOICE_ISSUED', 'PAYMENT_CREATED', 'PAYMENT_REVERSED']));
    });

    it('rejects schedules that do not sum to the total and ignores client totals', async () => {
      const a = tenants.a;
      const c = await a.admin.post('/customers', { name: 'C' }).expect(201);
      await a.admin
        .post('/invoices', { serviceId: a.services[0].id, invoiceType: 'SALES', customerId: c.body.id, items: [{ description: 'x', quantity: '2', unitPrice: '50' }], schedule: [{ amount: '99', dueType: 'NONE' }] })
        .expect(400);
      await a.admin
        .post('/invoices', { serviceId: a.services[0].id, invoiceType: 'SALES', customerId: c.body.id, total: '1', items: [{ description: 'x', quantity: '1', unitPrice: '5' }] })
        .expect(400);
    });

    it('never marks proformas overdue and converts them into a draft tax invoice once', async () => {
      const a = tenants.a;
      const c = await a.admin.post('/customers', { name: 'PF Customer' }).expect(201);
      const pf = await a.admin
        .post('/invoices', {
          serviceId: a.services[0].id, invoiceType: 'PROFORMA', customerId: c.body.id, taxMode: 'NONE',
          items: [{ description: 'Installation', quantity: '1', unitPrice: '1000' }],
          schedule: [{ description: 'Advance', amount: '400', dueType: 'FIXED', dueDate: '2020-01-01' }, { amount: '600', dueType: 'NONE' }],
        })
        .expect(201);
      const issued = await a.admin.post(`/invoices/${pf.body.id}/issue`).expect(200);
      expect(issued.body.status).toBe('ISSUED');
      await a.admin.post(`/invoices/${pf.body.id}/payments`, { amount: '1', method: 'CASH', paidAt: new Date().toISOString() }).expect(409);

      const draft = await a.admin.post(`/invoices/${pf.body.id}/convert`).expect(201);
      expect(draft.body).toMatchObject({ status: 'DRAFT', total: '1000', customerId: c.body.id, referenceInvoice: { id: pf.body.id } });
      expect(['TAX', 'SALES']).toContain(draft.body.invoiceType);
      expect(draft.body.schedule.map((s: { amount: string }) => s.amount)).toEqual(['400', '600']);
      await a.admin.post(`/invoices/${pf.body.id}/convert`).expect(409);
      await a.admin.post(`/invoices/${draft.body.id}/convert`).expect(400);
    });
  });

  it('audit logs are append-only at the database level', async () => {
    await expect(prisma.auditLog.deleteMany({})).rejects.toThrow();
  });
});
