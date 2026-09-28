import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { api, bootApp, createMasterAdmin, login } from './helpers';

/**
 * Opt-in (PERF=1): seeds ~10k invoices + payments into the test database, prints EXPLAIN ANALYZE
 * for the SQL Prisma generates for the invoice/payment list pages, and times the real endpoints.
 */
const run = process.env.PERF === '1' ? describe : describe.skip;
const N = 10_000;
const PW = 'Str0ngPass!word';
const RUN = Date.now().toString(36);
const email = (n: string) => `${n}-${RUN}@perf.local`;

run('List query performance (~10k invoices)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: ReturnType<typeof api>;
  let companyId: number;
  let serviceIds: number[];
  let customerId: number;

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    await createMasterAdmin(prisma, email('master'), PW);
    const master = api(app, (await login(app, email('master'), PW)).token);
    const res = await master.post('/admin/onboarding', {
      company: { legalName: `Perf ${RUN} Pvt Ltd`, displayName: `Perf ${RUN}` },
      admin: { fullName: 'Perf Admin', email: email('admin'), password: PW },
      services: [{ name: 'Perf A', code: 'PFA' }, { name: 'Perf B', code: 'PFB' }],
      activate: true,
    }).expect(201);
    companyId = res.body.id;
    serviceIds = res.body.services.map((s: { id: number }) => s.id);
    admin = api(app, (await login(app, email('admin'), PW)).token, companyId);
    customerId = (await admin.post('/customers', { name: 'Perf Customer' }).expect(201)).body.id;
    const creator = (await prisma.user.findUniqueOrThrow({ where: { email: email('admin') } })).id;

    await prisma.$executeRaw`
      INSERT INTO invoices ("companyId", "serviceId", "invoiceType", direction, status, "invoiceNumber", "customerId",
        "issueDate", "dueDate", subtotal, total, "paidAmount", "balanceAmount", "createdById", "createdAt", "updatedAt")
      SELECT ${companyId}::bigint, (${serviceIds}::bigint[])[1 + g % 2], 'TAX', 'RECEIVABLE',
        (CASE WHEN g % 3 = 0 THEN 'PAID' ELSE 'ISSUED' END)::"InvoiceStatus", 'PF-INV-' || lpad(g::text, 6, '0'), ${customerId}::bigint,
        current_date - (g % 365), current_date - (g % 365) + 30, 1000, 1180, CASE WHEN g % 3 = 0 THEN 1180 ELSE 0 END,
        CASE WHEN g % 3 = 0 THEN 0 ELSE 1180 END, ${creator}, now() - (g || ' minutes')::interval, now()
      FROM generate_series(1, ${N}::int) g`;
    await prisma.$executeRaw`
      INSERT INTO payments ("companyId", "serviceId", "invoiceId", amount, method, "receiptNumber", "paidAt", status, "createdById", "updatedAt")
      SELECT i."companyId", i."serviceId", i.id, 1180, 'BANK_TRANSFER', 'PF-RCT-' || i."invoiceNumber", i."issueDate", 'SUCCESS', ${creator}, now()
      FROM invoices i WHERE i."companyId" = ${companyId}::bigint`;
    for (const tbl of ['invoices', 'payments', 'customers', 'services']) await prisma.$executeRawUnsafe(`ANALYZE ${tbl}`);
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  /** Runs `fn` against a logging client and EXPLAIN ANALYZEs every SELECT it issues. */
  async function explain(label: string, fn: (db: PrismaClient) => Promise<unknown>) {
    const db = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
    const queries: { query: string; params: unknown[] }[] = [];
    db.$on('query', (e) => { if (/^\s*SELECT/i.test(e.query)) queries.push({ query: e.query, params: JSON.parse(e.params) }); });
    await fn(db);
    const out: string[] = [`\n===== ${label} (${queries.length} SELECTs) =====`];
    for (const q of queries) {
      // Inline params as untyped literals: bound raw params arrive as text, which bigint columns reject.
      const sql = q.query.replace(/\$(\d+)/g, (_, i) => {
        const v = q.params[Number(i) - 1];
        return typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
      });
      const plan = await db.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(`EXPLAIN (ANALYZE, BUFFERS) ${sql}`);
      out.push(`-- ${q.query.slice(0, 160)}…`, ...plan.map((r) => r['QUERY PLAN']), '');
    }
    await db.$disconnect();
    console.log(out.join('\n'));
  }

  it('invoice list: default page, status filter, search', async () => {
    const base = { companyId, serviceId: { in: serviceIds }, direction: 'RECEIVABLE' as const };
    const include = { customer: { select: { name: true } }, vendor: { select: { name: true } }, service: { select: { name: true } } };
    await explain('invoices: newest first, page 1', (db) => db.$transaction([
      db.invoice.findMany({ where: base, take: 20, skip: 0, orderBy: [{ createdAt: 'desc' }, { createdAt: 'desc' }], include }),
      db.invoice.count({ where: base }),
    ]));
    await explain('invoices: status=ISSUED, page 50', (db) => db.$transaction([
      db.invoice.findMany({ where: { ...base, status: 'ISSUED' }, take: 20, skip: 980, orderBy: [{ createdAt: 'desc' }], include }),
      db.invoice.count({ where: { ...base, status: 'ISSUED' } }),
    ]));
    await explain('invoices: search "000123"', (db) => db.invoice.findMany({
      where: { ...base, OR: [{ invoiceNumber: { contains: '000123', mode: 'insensitive' } }, { customer: { name: { contains: '000123', mode: 'insensitive' } } }] },
      take: 20, orderBy: [{ createdAt: 'desc' }], include,
    }));
  }, 120_000);

  it('payment list: default page with summary', async () => {
    const where = { companyId, serviceId: { in: serviceIds }, invoice: { direction: 'RECEIVABLE' as const } };
    await explain('payments: newest first, page 1 + sum', (db) => db.$transaction([
      db.payment.findMany({ where, take: 20, orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }], include: { invoice: { select: { invoiceNumber: true, direction: true, customer: { select: { name: true } }, vendor: { select: { name: true } } } } } }),
      db.payment.count({ where }),
      db.payment.aggregate({ where: { ...where, status: 'SUCCESS' }, _sum: { amount: true } }),
    ]));
  }, 120_000);

  it('real endpoints respond quickly at 10k rows', async () => {
    const timings: Record<string, number> = {};
    for (const url of ['/invoices?direction=RECEIVABLE', '/invoices?direction=RECEIVABLE&status=ISSUED&page=50', '/invoices?direction=RECEIVABLE&search=000123',
      '/payments?direction=RECEIVABLE', '/dashboard', '/reports/sales', '/reports/revenue']) {
      await admin.get(url); // warm
      const t0 = performance.now();
      const res = await admin.get(url);
      timings[`${res.status} ${url}`] = Math.round(performance.now() - t0);
    }
    console.log('\n===== endpoint timings (ms, warm) =====\n' + JSON.stringify(timings, null, 2));
    expect(Object.keys(timings).filter((k) => k.startsWith('200')).length).toBeGreaterThanOrEqual(6);
  }, 120_000);
});
