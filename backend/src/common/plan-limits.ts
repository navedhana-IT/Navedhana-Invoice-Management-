import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { Id } from './ids';

const count = z.number().int().min(0).nullable().optional();

/** Plan.limits JSON. Missing or null numeric limits mean unlimited; missing flags mean not included. */
export const planLimitsSchema = z.object({
  maxServices: count,
  maxUsers: count,
  maxEmployees: count,
  maxCustomers: count,
  maxVendors: count,
  maxInvoicesPerMonth: count,
  storageMb: count,
  customTemplates: z.boolean().optional(),
  reports: z.boolean().optional(),
  apiAccess: z.boolean().optional(),
}).strict();
export type PlanLimits = z.infer<typeof planLimitsSchema>;
export type CountLimit = 'maxServices' | 'maxUsers' | 'maxEmployees' | 'maxCustomers' | 'maxVendors' | 'maxInvoicesPerMonth';
export type FeatureFlag = 'customTemplates' | 'reports' | 'apiAccess';

export function parseLimits(json: unknown): PlanLimits {
  const r = planLimitsSchema.safeParse(json ?? {});
  if (!r.success) throw new BadRequestException(`Invalid plan limits: ${r.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  return r.data;
}

const LABEL: Record<CountLimit, string> = {
  maxServices: 'services', maxUsers: 'users', maxEmployees: 'employees', maxCustomers: 'customers', maxVendors: 'vendors', maxInvoicesPerMonth: 'invoices per month',
};

const FEATURE_LABEL: Record<FeatureFlag, string> = { customTemplates: 'custom invoice templates', reports: 'reports', apiAccess: 'API access' };

function startOfMonth() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

const COUNTERS: Record<CountLimit, (tx: Prisma.TransactionClient, companyId: Id) => Promise<number>> = {
  maxServices: (tx, companyId) => tx.service.count({ where: { companyId, status: 'ACTIVE' } }),
  maxUsers: async (tx, companyId) =>
    (await tx.membership.count({ where: { companyId, status: 'ACTIVE' } })) +
    (await tx.invitation.count({ where: { companyId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } })),
  maxEmployees: (tx, companyId) => tx.employee.count({ where: { companyId, status: 'ACTIVE' } }),
  maxCustomers: (tx, companyId) => tx.customer.count({ where: { companyId } }),
  maxVendors: (tx, companyId) => tx.vendor.count({ where: { companyId } }),
  maxInvoicesPerMonth: (tx, companyId) => tx.invoice.count({ where: { companyId, createdAt: { gte: startOfMonth() } } }),
};

async function planOf(db: Prisma.TransactionClient, companyId: Id) {
  const c = await db.company.findUniqueOrThrow({ where: { id: companyId }, select: { plan: { select: { name: true, limits: true } } } });
  return c.plan ? { name: c.plan.name, limits: parseLimits(c.plan.limits) } : null;
}

/**
 * Throws 403 when creating one more record would exceed the plan. Must run inside the creating
 * transaction: the company row lock serialises concurrent creates so the count can't race.
 */
export async function assertLimit(tx: Prisma.TransactionClient, companyId: Id, key: CountLimit, adding = 1) {
  await tx.$queryRaw`SELECT 1 FROM "companies" WHERE "id" = ${companyId}::bigint FOR UPDATE`;
  const plan = await planOf(tx, companyId);
  const limit = plan?.limits[key];
  if (plan == null || limit == null) return;
  if ((await COUNTERS[key](tx, companyId)) + adding > limit) {
    throw new ForbiddenException(`Your ${plan.name} plan allows ${limit} ${LABEL[key]}. Upgrade your plan to add more.`);
  }
}

export async function assertFeature(db: Prisma.TransactionClient, companyId: Id, flag: FeatureFlag) {
  const plan = await planOf(db, companyId);
  if (plan && !plan.limits[flag]) throw new ForbiddenException(`Your ${plan.name} plan doesn't include ${FEATURE_LABEL[flag]}. Upgrade your plan to use it.`);
}

/** Storage cap in bytes, or null when unlimited. */
export async function storageLimitBytes(db: Prisma.TransactionClient, companyId: Id) {
  const mb = (await planOf(db, companyId))?.limits.storageMb;
  return mb == null ? null : mb * 1024 * 1024;
}
