import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { api, bootApp, createMasterAdmin, login } from './helpers';

const PW = 'Str0ngPass!word';
const RUN = Date.now().toString(36);
const email = (name: string) => `${name}-${RUN}@ids.local`;
const UUID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const INVALID = ['abc', '0', '-1', '1.5', '01', UUID, '99999999999999999999'];

type Api = ReturnType<typeof api>;
type Tenant = { companyId: number; serviceId: number; token: string; admin: Api };

describe('Numeric sequential ids (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const t: Record<'a' | 'b', Tenant> = {} as never;
  const customer = async (who: Api, name: string) => (await who.post('/customers', { name }).expect(201)).body.id as number;

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    await createMasterAdmin(prisma, email('master'), PW);
    const master = api(app, (await login(app, email('master'), PW)).token);
    for (const key of ['a', 'b'] as const) {
      const res = await master
        .post('/admin/onboarding', {
          company: { legalName: `Ids ${key} ${RUN} Pvt Ltd`, displayName: `Ids ${key} ${RUN}` },
          admin: { fullName: `Admin ${key}`, email: email(`admin-${key}`), password: PW },
          services: [{ name: `Ids ${key}`, code: key === 'a' ? 'IDA' : 'IDB' }],
          activate: true,
        })
        .expect(201);
      const { token } = await login(app, email(`admin-${key}`), PW);
      t[key] = { companyId: res.body.id, serviceId: res.body.services[0].id, token, admin: api(app, token, res.body.id) };
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('schema', () => {
    it('gives every table with an id column its own bigint sequence', async () => {
      const rows = await prisma.$queryRaw<{ table_name: string; data_type: string; seq: string | null }[]>`
        SELECT c.table_name, c.data_type, pg_get_serial_sequence(quote_ident(c.table_name), 'id') AS seq
        FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.column_name = 'id' AND c.table_name <> '_prisma_migrations'`;
      expect(rows.length).toBeGreaterThanOrEqual(26);
      for (const r of rows) {
        expect({ table: r.table_name, type: r.data_type }).toEqual({ table: r.table_name, type: 'bigint' });
        expect(r.seq).toBe(`public.${r.table_name}_id_seq`);
      }
      expect(new Set(rows.map((r) => r.seq)).size).toBe(rows.length);
    });

    it('has no uuid columns or uuid defaults left', async () => {
      const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM information_schema.columns
        WHERE table_schema = 'public' AND (data_type = 'uuid' OR column_default ILIKE '%uuid%')`;
      expect(Number(n)).toBe(0);
    });
  });

  describe('generation', () => {
    it('assigns consecutive ids and returns them as JSON numbers', async () => {
      const [x, y, z] = [await customer(t.a.admin, 'Seq 1'), await customer(t.a.admin, 'Seq 2'), await customer(t.a.admin, 'Seq 3')];
      expect([typeof x, typeof y, typeof z]).toEqual(['number', 'number', 'number']);
      expect([y - x, z - y]).toEqual([1, 1]);
      const got = await t.a.admin.get(`/customers/${y}`).expect(200);
      expect(got.body).toMatchObject({ id: y, companyId: t.a.companyId });
      expect(typeof got.body.companyId).toBe('number');
    });

    it('keeps ids unique under 25 concurrent creates', async () => {
      const before = await customer(t.a.admin, 'Before burst');
      const ids = await Promise.all(Array.from({ length: 25 }, (_, i) => customer(t.a.admin, `Burst ${i}`)));
      expect(new Set(ids).size).toBe(25);
      expect(ids.every((id) => Number.isSafeInteger(id) && id > before)).toBe(true);
    });

    it('never reuses the id of a deleted row', async () => {
      const doomed = await customer(t.a.admin, 'Doomed');
      const del = await t.a.admin.delete(`/customers/${doomed}`);
      expect([200, 204]).toContain(del.status);
      await t.a.admin.get(`/customers/${doomed}`).expect(404);
      expect(await customer(t.a.admin, 'After delete')).toBeGreaterThan(doomed);
    });

    it('ignores client-supplied ids on create', async () => {
      await t.a.admin.post('/customers', { id: 1, name: 'Chosen id' }).expect(400);
    });
  });

  describe('foreign keys', () => {
    it('links records by numeric id across invoice, items and payments', async () => {
      const customerId = await customer(t.a.admin, 'FK customer');
      const inv = await t.a.admin
        .post('/invoices', { serviceId: t.a.serviceId, invoiceType: 'SALES', customerId, taxMode: 'NONE', items: [{ description: 'Work', quantity: '1', unitPrice: '100' }] })
        .expect(201);
      expect(inv.body).toMatchObject({ customerId, serviceId: t.a.serviceId, companyId: t.a.companyId });
      expect(inv.body.items.every((i: { id: unknown; invoiceId: unknown }) => typeof i.id === 'number' && i.invoiceId === inv.body.id)).toBe(true);
      await t.a.admin.post(`/invoices/${inv.body.id}/issue`).expect(200);
      expect(inv.body.invoiceNumber ?? null).toBeNull();
      const issued = await t.a.admin.get(`/invoices/${inv.body.id}`).expect(200);
      expect(issued.body.invoiceNumber).toMatch(/^IDA-INV-\d{6}$/);
      const pay = await t.a.admin.post(`/invoices/${inv.body.id}/payments`, { amount: '40', method: 'CASH', paidAt: new Date(Date.now() - 60_000).toISOString() }).expect(201);
      expect(pay.body).toMatchObject({ invoiceId: inv.body.id });
      expect(typeof pay.body.id).toBe('number');
    });

    it('rejects references to rows that do not exist without a server error', async () => {
      const res = await t.a.admin.post('/invoices', { serviceId: t.a.serviceId, invoiceType: 'SALES', customerId: 999_999_999, items: [{ description: 'x', quantity: '1', unitPrice: '1' }] });
      expect([400, 404]).toContain(res.status);
    });
  });

  describe('validation', () => {
    it.each(INVALID)('rejects %p as a path id', async (bad) => {
      await t.a.admin.get(`/customers/${encodeURIComponent(bad)}`).expect(400);
    });

    it.each(INVALID)('rejects %p as a query id', async (bad) => {
      await t.a.admin.get(`/invoice-templates?serviceId=${encodeURIComponent(bad)}`).expect(400);
    });

    it.each([...INVALID, -5, 0, 1.5, true])('rejects %p as a body id', async (bad) => {
      const res = await t.a.admin
        .post('/invoices', { serviceId: t.a.serviceId, invoiceType: 'SALES', customerId: bad, items: [{ description: 'x', quantity: '1', unitPrice: '1' }] })
        .expect(400);
      expect(JSON.stringify(res.body)).toMatch(/customerId/);
    });

    it.each(INVALID)('rejects %p as X-Company-Id and X-Service-Id', async (bad) => {
      const h = (name: string, value: string) => request(app.getHttpServer()).get('/api/v1/customers').set('Authorization', `Bearer ${t.a.token}`).set(name, value);
      await h('X-Company-Id', bad).expect(400);
      await h('X-Company-Id', String(t.a.companyId)).set('X-Service-Id', bad).expect(400);
    });
  });

  describe('enumeration across tenants', () => {
    it('sequential ids do not expose another company', async () => {
      const mine = await customer(t.a.admin, 'Private');
      for (const id of [mine - 1, mine, mine + 1]) {
        await t.b.admin.get(`/customers/${id}`).expect(404);
        await t.b.admin.patch(`/customers/${id}`, { name: 'Hijack' }).expect(404);
      }
      expect((await t.a.admin.get(`/customers/${mine}`).expect(200)).body.name).toBe('Private');
    });

    it('guessing another company or brand id in headers is refused without confirming it exists', async () => {
      await api(app, t.b.token, t.a.companyId).get('/customers').expect(404);
      await api(app, t.b.token, t.b.companyId, t.a.serviceId).get('/customers').expect(404);
      await api(app, t.b.token, 999_999_999).get('/customers').expect(404);
      await api(app, t.b.token, t.b.companyId).post('/invoices', { serviceId: t.a.serviceId, invoiceType: 'SALES', customerId: 1, items: [{ description: 'x', quantity: '1', unitPrice: '1' }] })
        .expect((r) => expect([403, 404]).toContain(r.status));
    });
  });
});
