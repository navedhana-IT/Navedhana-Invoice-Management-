import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Actor } from '../common/decorators';
import type { Id } from '../common/ids';
import type { Permission } from '../common/permissions';

/**
 * Resolved per request by TenantGuard from the DB, never from client-supplied data.
 * companyWide: permissions from roles not bound to a service.
 * byService: permissions from service-bound roles.
 */
export class TenantContext {
  constructor(
    readonly actor: Actor,
    readonly companyId: Id,
    readonly allowedServiceIds: Id[],
    private readonly companyWide: Set<string>,
    private readonly byService: Map<Id, Set<string>>,
    /** Optional X-Service-Id narrowing chosen in the UI (already validated). */
    readonly serviceId?: Id,
  ) {}

  get userId() {
    return this.actor.userId;
  }

  /** True if the user holds the permission anywhere in the company. */
  hasAny(p: Permission) {
    return this.companyWide.has(p) || [...this.byService.values()].some((s) => s.has(p));
  }

  can(p: Permission, serviceId: Id) {
    if (!this.allowedServiceIds.includes(serviceId)) return false;
    return this.companyWide.has(p) || !!this.byService.get(serviceId)?.has(p);
  }

  /** Service IDs where the user holds `p`, narrowed by X-Service-Id. Use in list queries. */
  serviceScope(p: Permission): Id[] {
    const ids = this.allowedServiceIds.filter((id) => this.can(p, id));
    return this.serviceId ? ids.filter((id) => id === this.serviceId) : ids;
  }

  /** Throws 404 for services outside scope (does not leak existence), 403 if visible but not permitted. */
  assertService(p: Permission, serviceId: Id) {
    if (!this.allowedServiceIds.includes(serviceId)) throw new NotFoundException('Service not found');
    if (!this.can(p, serviceId)) throw new ForbiddenException(`Missing permission ${p}`);
  }

  permissionsFor(serviceId?: Id): string[] {
    const set = new Set(this.companyWide);
    if (serviceId) this.byService.get(serviceId)?.forEach((p) => set.add(p));
    else this.byService.forEach((s) => s.forEach((p) => set.add(p)));
    return [...set].sort();
  }
}
