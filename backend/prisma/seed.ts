/**
 * Seeds platform data: plans, system roles, master admin.
 * SEED_DEMO=true additionally creates the Navedhana demo tenant with three services.
 * Credentials come from env only (MASTER_ADMIN_EMAIL / MASTER_ADMIN_PASSWORD / DEMO_ADMIN_PASSWORD).
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { existsSync } from 'fs';
import { SYSTEM_ROLES } from '../src/common/permissions';
import { asJson, defaultTemplateConfig } from '../src/modules/invoice-templates/template-config.schema';

if (existsSync('.env')) process.loadEnvFile('.env');
const prisma = new PrismaClient();
const hash = (p: string) => argon2.hash(p, { type: argon2.argon2id });

function required(name: string) {
  const v = process.env[name];
  if (!v || v.length < 8) throw new Error(`${name} must be set (min 8 chars) to seed`);
  return v;
}

async function main() {
  // Starter plans only; afterwards the master admin owns plans, so re-seeding never overwrites edits.
  const plans = [
    {
      code: 'ESSENTIAL', name: 'Essential', description: 'For a single business getting organised.', price: '999', displayOrder: 0, trialDays: 14,
      features: ['1 business service', 'Up to 5 team members', 'GST invoices & receipts', 'Payment tracking', 'Customer management'],
      limits: { maxServices: 1, maxUsers: 5, maxEmployees: 25, maxCustomers: 500, maxVendors: 100, maxInvoicesPerMonth: 200, storageMb: 1024, customTemplates: false, reports: true, apiAccess: false },
    },
    {
      code: 'ADVANCED', name: 'Advanced', description: 'For growing companies with several brands.', price: '2999', displayOrder: 1, trialDays: 14, highlighted: true,
      features: ['Up to 5 business services', 'Up to 25 team members', 'Vendor bills & payables', 'Payment schedules', 'Custom invoice templates', 'Reports & exports'],
      limits: { maxServices: 5, maxUsers: 25, maxEmployees: 250, maxCustomers: 5000, maxVendors: 1000, maxInvoicesPerMonth: 2000, storageMb: 10240, customTemplates: true, reports: true, apiAccess: false },
    },
    {
      code: 'PREMIUM', name: 'Premium', description: 'For multi-brand groups that need everything.', price: '7999', displayOrder: 2, trialDays: 14,
      features: ['Unlimited business services', 'Unlimited team members', 'Custom roles & permissions', 'Full audit trail', 'API access', 'Priority support'],
      limits: { maxServices: null, maxUsers: null, maxEmployees: null, maxCustomers: null, maxVendors: null, maxInvoicesPerMonth: null, storageMb: 102400, customTemplates: true, reports: true, apiAccess: true },
    },
  ];
  for (const p of plans) await prisma.plan.upsert({ where: { code: p.code }, create: p, update: {} });

  for (const r of SYSTEM_ROLES) {
    const existing = await prisma.role.findFirst({ where: { companyId: null, key: r.key } });
    const data = { name: r.name, permissions: r.permissions, allServices: r.allServices, isSystem: true };
    if (existing) await prisma.role.update({ where: { id: existing.id }, data });
    else await prisma.role.create({ data: { ...data, key: r.key } });
  }

  const email = required('MASTER_ADMIN_EMAIL').toLowerCase();
  const password = required('MASTER_ADMIN_PASSWORD');
  await prisma.user.upsert({
    where: { email },
    create: { email, fullName: 'Platform Admin', passwordHash: await hash(password), isMasterAdmin: true },
    update: { isMasterAdmin: true },
  });
  console.log(`Seeded plans, ${SYSTEM_ROLES.length} system roles, master admin ${email}`);

  if (process.env.SEED_DEMO === 'true') await demo();
}

async function demo() {
  if (await prisma.company.findUnique({ where: { slug: 'navedhana' } })) return console.log('Demo tenant exists');
  const premium = await prisma.plan.findUniqueOrThrow({ where: { code: 'PREMIUM' } });
  const adminRole = await prisma.role.findFirstOrThrow({ where: { companyId: null, key: 'company_admin' } });
  const company = await prisma.company.create({
    data: { slug: 'navedhana', legalName: 'Navedhana Private Limited', displayName: 'Navedhana', state: 'Telangana', city: 'Hyderabad', status: 'ACTIVE', planId: premium.id },
  });
  const services = [
    { slug: 'software', name: 'Navedhana Software Services', code: 'NSS', description: 'Custom software, web and mobile development.' },
    { slug: 'solar', name: 'Likith Solar Power', code: 'LSP', description: 'Rooftop and commercial solar installations.' },
    { slug: 'agriculture', name: 'Navedhana Agriculture', code: 'NAG', description: 'Farm produce and agri-services.' },
  ];
  for (const s of services) {
    const svc = await prisma.service.create({
      data: { ...s, companyId: company.id, displayName: s.name, state: 'Telangana', isPublic: true, terms: 'Payment due as per schedule. Late payments attract 1.5% monthly interest.', bankDetails: { accountName: s.name, bankName: 'HDFC Bank', accountNumber: 'XXXXXX1234', ifsc: 'HDFC0000001' } },
    });
    const tpl = await prisma.invoiceTemplate.create({
      data: { companyId: company.id, serviceId: svc.id, name: 'Standard', versions: { create: { companyId: company.id, version: 1, config: asJson(defaultTemplateConfig()), status: 'PUBLISHED', publishedAt: new Date() } } },
    });
    await prisma.service.update({ where: { id: svc.id }, data: { defaultTemplateId: tpl.id } });
  }
  const demoEmail = (process.env.DEMO_ADMIN_EMAIL ?? 'admin@navedhana.demo').toLowerCase();
  const user = await prisma.user.upsert({
    where: { email: demoEmail },
    create: { email: demoEmail, fullName: 'Navedhana Admin', passwordHash: await hash(required('DEMO_ADMIN_PASSWORD')) },
    update: {},
  });
  await prisma.membership.create({ data: { companyId: company.id, userId: user.id, roles: { create: { roleId: adminRole.id } } } });
  await prisma.customer.create({ data: { companyId: company.id, name: 'Sri Lakshmi Traders', email: 'accounts@srilakshmi.example', state: 'Telangana', billingAddress: 'Banjara Hills, Hyderabad' } });
  await prisma.vendor.create({ data: { companyId: company.id, name: 'SunTech Panels', state: 'Karnataka', paymentTermsDays: 45 } });
  console.log(`Demo tenant "Navedhana Private Limited" with ${services.length} services, admin ${demoEmail}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
