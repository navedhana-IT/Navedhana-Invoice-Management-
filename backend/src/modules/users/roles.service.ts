import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { isPermission } from '../../common/permissions';
import { slugify } from '../../common/slug';
import { PrismaService } from '../../infra/prisma.service';
import type { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from '../audit/audit.service';
import { CreateRoleDto, UpdateRoleDto } from './dto';
import type { Id } from '../../common/ids';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(t: TenantContext) {
    return this.prisma.role.findMany({
      where: { OR: [{ companyId: null }, { companyId: t.companyId }] },
      include: { _count: { select: { members: { where: { membership: { companyId: t.companyId } } } } } },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  async create(t: TenantContext, dto: CreateRoleDto) {
    this.validate(t, dto.permissions);
    if (dto.allServices) await this.assertSeesAllServices(t);
    const role = await this.prisma.role.create({
      data: { ...dto, companyId: t.companyId, key: `${slugify(dto.name)}-${Date.now().toString(36)}` },
    });
    await this.audit.log({ actor: t.actor, companyId: t.companyId, action: 'ROLE_CREATED', entityType: 'role', entityId: role.id, newValue: dto });
    return role;
  }

  async update(t: TenantContext, id: Id, dto: UpdateRoleDto) {
    const role = await this.owned(t, id);
    if (dto.permissions) this.validate(t, dto.permissions);
    if (dto.allServices) await this.assertSeesAllServices(t);
    const updated = await this.prisma.role.update({ where: { id }, data: dto });
    await this.audit.log({ actor: t.actor, companyId: t.companyId, action: 'ROLE_UPDATED', entityType: 'role', entityId: id, previousValue: role, newValue: dto });
    return updated;
  }

  async remove(t: TenantContext, id: Id) {
    await this.owned(t, id);
    if (await this.prisma.membershipRole.count({ where: { roleId: id } })) throw new ConflictException('Role is assigned to users');
    await this.prisma.role.delete({ where: { id } });
    await this.audit.log({ actor: t.actor, companyId: t.companyId, action: 'ROLE_DELETED', entityType: 'role', entityId: id });
  }

  /** System roles are read-only; only this company's custom roles can change. */
  private async owned(t: TenantContext, id: Id) {
    const role = await this.prisma.role.findFirst({ where: { id, companyId: t.companyId } });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  private async assertSeesAllServices(t: TenantContext) {
    const total = await this.prisma.service.count({ where: { companyId: t.companyId } });
    if (t.allowedServiceIds.length < total) throw new ForbiddenException('Cannot grant access to all services');
  }

  private validate(t: TenantContext, permissions: string[]) {
    const unknown = permissions.filter((p) => !isPermission(p));
    if (unknown.length) throw new BadRequestException(`Unknown permissions: ${unknown.join(', ')}`);
    if (t.actor.isMasterAdmin) return;
    const mine = new Set(t.permissionsFor());
    if (permissions.some((p) => !mine.has(p))) throw new ForbiddenException('Cannot grant permissions you do not have');
  }
}
