import { ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import type { SubscriptionStatus } from '@prisma/client';
import { ALL_PERMISSIONS } from '../common/permissions';
import type { Actor } from '../common/decorators';
import type { Id } from '../common/ids';
import { PrismaService } from '../infra/prisma.service';
import { TenantContext } from './tenant-context';

@Injectable()
export class TenantContextFactory {
  constructor(private readonly prisma: PrismaService) {}

  /** `write`: the request changes data, so a lapsed trial/subscription blocks it (reads stay available). */
  async build(actor: Actor, companyId: Id, serviceId?: Id, write = false): Promise<TenantContext> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { status: true, subscriptionStatus: true, trialEndsAt: true, services: { select: { id: true } } },
    });
    if (!company) throw new NotFoundException('Company not found');
    const allServiceIds = company.services.map((s) => s.id);

    let ctx: TenantContext;
    if (actor.isMasterAdmin) {
      ctx = new TenantContext(actor, companyId, allServiceIds, new Set(ALL_PERMISSIONS), new Map(), serviceId);
    } else {
      if (company.status !== 'ACTIVE') throw new ForbiddenException('This company account is not active. Please contact support');
      if (write && subscriptionLapsed(company)) {
        throw new HttpException(
          { code: 'SUBSCRIPTION_REQUIRED', message: 'Your trial has ended. You can still view your data; contact us to activate your plan and continue creating records.' },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      const m = await this.prisma.membership.findUnique({
        where: { companyId_userId: { companyId, userId: actor.userId } },
        include: { roles: { include: { role: true } }, serviceAssignments: true },
      });
      if (!m || m.status !== 'ACTIVE') throw new NotFoundException('Company not found');

      const companyWide = new Set<string>();
      const byService = new Map<Id, Set<string>>();
      let allServices = false;
      for (const { role, serviceId: sid } of m.roles) {
        if (sid) {
          const set = byService.get(sid) ?? new Set<string>();
          role.permissions.forEach((p) => set.add(p));
          byService.set(sid, set);
        } else {
          role.permissions.forEach((p) => companyWide.add(p));
          allServices ||= role.allServices;
        }
      }
      const allowed = allServices
        ? allServiceIds
        : [...new Set([...m.serviceAssignments.map((a) => a.serviceId), ...byService.keys()])].filter((id) =>
            allServiceIds.includes(id),
          );
      ctx = new TenantContext(actor, companyId, allowed, companyWide, byService, serviceId);
    }

    if (serviceId && !ctx.allowedServiceIds.includes(serviceId)) throw new NotFoundException('Service not found');
    return ctx;
  }
}

export function subscriptionLapsed(c: { subscriptionStatus: SubscriptionStatus; trialEndsAt: Date | null }, now = new Date()) {
  return c.subscriptionStatus === 'EXPIRED' || (c.subscriptionStatus === 'TRIALING' && !!c.trialEndsAt && c.trialEndsAt < now);
}
