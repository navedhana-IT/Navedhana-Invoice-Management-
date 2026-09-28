import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CompanyStatus, Prisma } from '@prisma/client';
import type { Actor } from '../../common/decorators';
import { orderBy, pageArgs, toPage } from '../../common/pagination';
import { parseLimits } from '../../common/plan-limits';
import { revalidateWeb } from '../../common/revalidate';
import { slugify } from '../../common/slug';
import { PrismaService } from '../../infra/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ServicesService } from '../services/services.service';
import { UsersService } from '../users/users.service';
import {
  AdminUserQuery, CompanyDto, CompanyQuery, OnboardingDto, PlanDto, ReorderPlansDto, SubscriptionDto, UpdateCompanyDto, UpdatePlanDto,
} from './dto';
import type { Id } from '../../common/ids';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly services: ServicesService,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
  ) {}

  async listCompanies(q: CompanyQuery) {
    const where: Prisma.CompanyWhereInput = {
      ...(q.status && { status: q.status }),
      ...(q.planId && { planId: q.planId }),
      ...(q.subscriptionStatus && { subscriptionStatus: q.subscriptionStatus }),
      ...(q.search && {
        OR: [
          { legalName: { contains: q.search, mode: 'insensitive' } },
          { displayName: { contains: q.search, mode: 'insensitive' } },
          { email: { contains: q.search, mode: 'insensitive' } },
          { gstin: { contains: q.search, mode: 'insensitive' } },
        ],
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.company.findMany({
        where, ...pageArgs(q), orderBy: orderBy(q, ['createdAt', 'legalName', 'displayName', 'status']),
        include: { plan: { select: { id: true, name: true } }, _count: { select: { services: true, memberships: true } } },
      }),
      this.prisma.company.count({ where }),
    ]);
    return toPage(data, total, q);
  }

  async getCompany(id: Id) {
    const c = await this.prisma.company.findUnique({
      where: { id },
      include: {
        plan: true,
        services: { select: { id: true, name: true, displayName: true, status: true, code: true } },
        memberships: { select: { id: true, status: true, user: { select: { email: true, fullName: true } }, roles: { select: { role: { select: { name: true } } } } } },
      },
    });
    if (!c) throw new NotFoundException('Company not found');
    return c;
  }

  async createCompany(dto: CompanyDto, actor: Actor, tx: Prisma.TransactionClient = this.prisma) {
    if (dto.planId) await this.activePlan(tx, dto.planId);
    const company = await tx.company.create({ data: { ...dto, slug: await this.uniqueSlug(tx, dto.displayName) } });
    await this.audit.log({ actor, companyId: company.id, action: 'COMPANY_CREATED', entityType: 'company', entityId: company.id, newValue: dto }, tx);
    return company;
  }

  async updateCompany(id: Id, dto: UpdateCompanyDto, actor: Actor) {
    const before = await this.getCompany(id);
    if (dto.planId && dto.planId !== before.planId) await this.activePlan(this.prisma, dto.planId);
    const after = await this.prisma.company.update({ where: { id }, data: dto });
    await this.audit.log({ actor, companyId: id, action: 'COMPANY_UPDATED', entityType: 'company', entityId: id, previousValue: { ...before, memberships: undefined, services: undefined }, newValue: dto });
    return after;
  }

  async setStatus(id: Id, status: CompanyStatus, actor: Actor) {
    const before = await this.getCompany(id);
    const c = await this.prisma.company.update({ where: { id }, data: { status } });
    await this.audit.log({ actor, companyId: id, action: status === 'ACTIVE' ? 'COMPANY_ACTIVATED' : 'COMPANY_DEACTIVATED', entityType: 'company', entityId: id });
    if (status === 'ACTIVE' && before.status !== 'ACTIVE') {
      await this.notifications.notifyPermission('company.update', { companyId: id, type: 'COMPANY_ACTIVATED', title: 'Your company is active', body: `${c.displayName} is ready to use`, link: '/app' });
    }
    return c;
  }

  /** Manual billing: the master admin moves a company between trial, active and expired, or changes its plan. */
  async setSubscription(id: Id, dto: SubscriptionDto, actor: Actor) {
    const before = await this.getCompany(id);
    if (dto.planId && dto.planId !== before.planId) await this.activePlan(this.prisma, dto.planId);
    if (dto.subscriptionStatus === 'TRIALING' && !dto.trialEndsAt && !before.trialEndsAt) {
      throw new BadRequestException('Set a trial end date when moving a company to trial');
    }
    const c = await this.prisma.company.update({ where: { id }, data: dto });
    await this.audit.log({
      actor, companyId: id, action: 'SUBSCRIPTION_UPDATED', entityType: 'company', entityId: id,
      previousValue: { subscriptionStatus: before.subscriptionStatus, trialEndsAt: before.trialEndsAt, planId: before.planId }, newValue: dto,
    });
    return c;
  }

  /** Company + admin + services (+ default templates) in one transaction. */
  onboard(dto: OnboardingDto, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const company = await this.createCompany(dto.company, actor, tx);
      const adminRole = await tx.role.findFirstOrThrow({ where: { companyId: null, key: 'company_admin' } });
      await this.users.addMemberInTx(tx, company.id, { ...dto.admin, roles: [{ roleId: adminRole.id }] }, actor);
      for (const s of dto.services) await this.services.createInTx(tx, company.id, s, actor);
      if (dto.activate) {
        await tx.company.update({ where: { id: company.id }, data: { status: 'ACTIVE' } });
        await this.audit.log({ actor, companyId: company.id, action: 'COMPANY_ACTIVATED', entityType: 'company', entityId: company.id }, tx);
      }
      return tx.company.findUniqueOrThrow({ where: { id: company.id }, include: { services: { orderBy: [{ createdAt: 'asc' }, { code: 'asc' }] } } });
    }, { timeout: 20_000 });
  }

  listPlans() {
    return this.prisma.plan.findMany({ orderBy: [{ displayOrder: 'asc' }, { price: 'asc' }], include: { _count: { select: { companies: true } } } });
  }

  async createPlan(dto: PlanDto, actor: Actor) {
    const limits = parseLimits(dto.limits);
    const displayOrder = dto.displayOrder ?? ((await this.prisma.plan.aggregate({ _max: { displayOrder: true } }))._max.displayOrder ?? -1) + 1;
    const plan = await this.prisma.plan.create({ data: { ...dto, limits, displayOrder } });
    await this.audit.log({ actor, action: 'PLAN_CREATED', entityType: 'plan', entityId: plan.id, newValue: dto });
    revalidateWeb(['plans']);
    return plan;
  }

  async updatePlan(id: Id, dto: UpdatePlanDto, actor: Actor) {
    const before = await this.plan(id);
    const { limits, ...rest } = dto;
    const plan = await this.prisma.plan.update({ where: { id }, data: { ...rest, ...(limits && { limits: parseLimits(limits) }) } });
    await this.audit.log({ actor, action: 'PLAN_UPDATED', entityType: 'plan', entityId: id, previousValue: before, newValue: dto });
    revalidateWeb(['plans']);
    return plan;
  }

  async setPlanActive(id: Id, isActive: boolean, actor: Actor) {
    await this.plan(id);
    const plan = await this.prisma.plan.update({ where: { id }, data: { isActive } });
    await this.audit.log({ actor, action: isActive ? 'PLAN_ACTIVATED' : 'PLAN_DEACTIVATED', entityType: 'plan', entityId: id });
    revalidateWeb(['plans']);
    return plan;
  }

  async reorderPlans(dto: ReorderPlansDto, actor: Actor) {
    const found = await this.prisma.plan.count({ where: { id: { in: dto.ids } } });
    if (found !== new Set(dto.ids).size) throw new BadRequestException('Some plans in the new order no longer exist');
    await this.prisma.$transaction(dto.ids.map((id, displayOrder) => this.prisma.plan.update({ where: { id }, data: { displayOrder } })));
    await this.audit.log({ actor, action: 'PLANS_REORDERED', entityType: 'plan', newValue: dto });
    revalidateWeb(['plans']);
    return this.listPlans();
  }

  /** Plans with subscribers can only be deactivated, so existing companies keep their limits. */
  async deletePlan(id: Id, actor: Actor) {
    const plan = await this.prisma.plan.findUnique({ where: { id }, include: { _count: { select: { companies: true } } } });
    if (!plan) throw new NotFoundException('Plan not found');
    if (plan._count.companies) throw new ConflictException(`${plan._count.companies} companies use this plan. Deactivate it instead so it's hidden from new signups.`);
    await this.prisma.plan.delete({ where: { id } });
    await this.audit.log({ actor, action: 'PLAN_DELETED', entityType: 'plan', entityId: id, previousValue: plan });
    revalidateWeb(['plans']);
  }

  async listUsers(q: AdminUserQuery) {
    const where: Prisma.UserWhereInput = {
      ...(q.status && { status: q.status }),
      ...(q.search && { OR: [{ email: { contains: q.search, mode: 'insensitive' } }, { fullName: { contains: q.search, mode: 'insensitive' } }] }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where, ...pageArgs(q), orderBy: orderBy(q, ['createdAt', 'email', 'fullName', 'lastLoginAt']),
        select: {
          id: true, email: true, fullName: true, phone: true, status: true, isMasterAdmin: true, lastLoginAt: true, createdAt: true,
          memberships: { select: { status: true, company: { select: { id: true, displayName: true } } } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return toPage(data, total, q);
  }

  async setUserStatus(id: Id, status: 'ACTIVE' | 'INACTIVE', actor: Actor) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (status === 'INACTIVE' && id === actor.userId) throw new BadRequestException("You can't deactivate your own account");
    if (status === 'INACTIVE' && user.isMasterAdmin && (await this.prisma.user.count({ where: { isMasterAdmin: true, status: 'ACTIVE' } })) <= 1) {
      throw new ConflictException('At least one active master admin is required');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { status } });
      if (status === 'INACTIVE') await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log({ actor, action: status === 'ACTIVE' ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', entityType: 'user', entityId: id }, tx);
    });
    return { id, status };
  }

  async dashboard() {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [companies, active, trialing, users, invoices, payments, recentAudit, byAction] = await this.prisma.$transaction([
      this.prisma.company.count(),
      this.prisma.company.count({ where: { status: 'ACTIVE' } }),
      this.prisma.company.count({ where: { subscriptionStatus: 'TRIALING' } }),
      this.prisma.user.count(),
      this.prisma.invoice.count({ where: { status: { not: 'DRAFT' } } }),
      this.prisma.payment.aggregate({ where: { status: 'SUCCESS' }, _sum: { amount: true }, _count: true }),
      this.prisma.auditLog.findMany({ take: 10, orderBy: { createdAt: 'desc' } }),
      this.prisma.auditLog.groupBy({ by: ['action'], where: { createdAt: { gte: since } }, _count: { _all: true }, orderBy: { action: 'asc' } }),
    ]);
    return {
      companies, activeCompanies: active, trialingCompanies: trialing, users, issuedInvoices: invoices,
      paymentsCount: payments._count, paymentsTotal: payments._sum.amount ?? '0',
      activity30d: byAction.map((a) => ({ action: a.action, count: (a._count as { _all: number })._all })),
      recentAudit,
    };
  }

  private async plan(id: Id) {
    const p = await this.prisma.plan.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Plan not found');
    return p;
  }

  private async activePlan(db: Prisma.TransactionClient, id: Id) {
    const p = await db.plan.findUnique({ where: { id } });
    if (!p || !p.isActive) throw new BadRequestException('Choose an active plan');
    return p;
  }

  private async uniqueSlug(tx: Prisma.TransactionClient, name: string) {
    const base = slugify(name);
    for (let i = 0; ; i++) {
      const slug = i ? `${base}-${i + 1}` : base;
      if (!(await tx.company.findUnique({ where: { slug } }))) return slug;
    }
  }
}
