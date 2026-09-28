import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Actor } from '../../common/decorators';
import { orderBy, pageArgs, toPage } from '../../common/pagination';
import { assertLimit } from '../../common/plan-limits';
import { PrismaService } from '../../infra/prisma.service';
import type { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { CreateUserDto, RoleAssignmentDto, UpdateUserDto, UserQuery as PageQuery } from './dto';
import type { Id } from '../../common/ids';

type Tx = Prisma.TransactionClient;

const memberSelect = {
  id: true, status: true, createdAt: true,
  user: { select: { id: true, email: true, fullName: true, phone: true, lastLoginAt: true } },
  roles: { select: { serviceId: true, role: { select: { id: true, key: true, name: true } } } },
  serviceAssignments: { select: { serviceId: true } },
} satisfies Prisma.MembershipSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(t: TenantContext, q: PageQuery) {
    const where: Prisma.MembershipWhereInput = {
      companyId: t.companyId,
      ...(q.status && { status: q.status }),
      ...(q.roleId && { roles: { some: { roleId: q.roleId } } }),
      ...(q.serviceId && { OR: [{ serviceAssignments: { some: { serviceId: q.serviceId } } }, { roles: { some: { serviceId: q.serviceId } } }, { roles: { some: { serviceId: null, role: { allServices: true } } } }] }),
      ...(q.search && { user: { OR: [{ fullName: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }] } }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.membership.findMany({ where, select: memberSelect, ...pageArgs(q), orderBy: q.sort?.startsWith('name') ? { user: { fullName: q.sort.endsWith(':asc') ? 'asc' : 'desc' } } : orderBy(q, ['createdAt', 'status']) }),
      this.prisma.membership.count({ where }),
    ]);
    return toPage(data, total, q);
  }

  /** Creates a brand-new account with a password. Existing accounts must be invited so they consent to joining. */
  async create(t: TenantContext, dto: CreateUserDto) {
    await this.checkAssignable(t, dto.roles);
    if (!dto.password) throw new BadRequestException('Set a password, or send an invitation so they choose their own');
    if (await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase().trim() } })) {
      throw new ConflictException('Someone already has an account with this email. Send them an invitation instead');
    }
    return this.prisma.$transaction(async (tx) => {
      await assertLimit(tx, t.companyId, 'maxUsers');
      return this.addMemberInTx(tx, t.companyId, dto, t.actor);
    });
  }

  /** Find-or-create the user, then (re)set membership roles and service assignments. */
  async addMemberInTx(tx: Tx, companyId: Id, dto: CreateUserDto, actor: Actor) {
    const email = dto.email.toLowerCase().trim();
    let user = await tx.user.findUnique({ where: { email } });
    if (!user) {
      if (!dto.password) throw new BadRequestException('Password is required for a new user');
      user = await tx.user.create({ data: { email, fullName: dto.fullName, phone: dto.phone, passwordHash: await AuthService.hashPassword(dto.password) } });
      await this.audit.log({ actor, companyId, action: 'USER_CREATED', entityType: 'user', entityId: user.id, newValue: { email, fullName: dto.fullName } }, tx);
    }
    const membership = await tx.membership.upsert({
      where: { companyId_userId: { companyId, userId: user.id } },
      create: { companyId, userId: user.id },
      update: { status: 'ACTIVE' },
    });
    await this.setAccess(tx, companyId, membership.id, dto.roles, dto.serviceIds ?? [], actor);
    return tx.membership.findUniqueOrThrow({ where: { id: membership.id }, select: memberSelect });
  }

  async update(t: TenantContext, membershipId: Id, dto: UpdateUserDto) {
    const m = await this.prisma.membership.findFirst({ where: { id: membershipId, companyId: t.companyId }, include: { user: true } });
    if (!m) throw new NotFoundException('User not found');
    if (m.userId === t.userId && (dto.status === 'INACTIVE' || dto.roles)) throw new ForbiddenException('You cannot change your own access');
    if (dto.roles) await this.checkAssignable(t, dto.roles);
    return this.prisma.$transaction(async (tx) => {
      if (dto.status === 'ACTIVE' && m.status !== 'ACTIVE') await assertLimit(tx, t.companyId, 'maxUsers');
      if (dto.fullName) await tx.user.update({ where: { id: m.userId }, data: { fullName: dto.fullName } });
      if (dto.status) await tx.membership.update({ where: { id: m.id }, data: { status: dto.status } });
      if (dto.roles || dto.serviceIds) {
        const current = await tx.membershipRole.findMany({ where: { membershipId: m.id } });
        const assigned = await tx.serviceAssignment.findMany({ where: { membershipId: m.id } });
        await this.setAccess(tx, t.companyId, m.id, dto.roles ?? current.map((r) => ({ roleId: r.roleId, serviceId: r.serviceId ?? undefined })), dto.serviceIds ?? assigned.map((a) => a.serviceId), t.actor);
      }
      await this.audit.log({ actor: t.actor, companyId: t.companyId, action: 'USER_UPDATED', entityType: 'membership', entityId: m.id, newValue: dto }, tx);
      return tx.membership.findUniqueOrThrow({ where: { id: m.id }, select: memberSelect });
    });
  }

  async setAccess(tx: Tx, companyId: Id, membershipId: Id, roles: RoleAssignmentDto[], serviceIds: Id[], actor: Actor) {
    const roleIds = [...new Set(roles.map((r) => r.roleId))];
    const validRoles = await tx.role.count({ where: { id: { in: roleIds }, OR: [{ companyId: null }, { companyId }] } });
    if (validRoles !== roleIds.length) throw new BadRequestException('Unknown role');
    const sids = [...new Set([...serviceIds, ...roles.flatMap((r) => (r.serviceId ? [r.serviceId] : []))])];
    const validServices = await tx.service.count({ where: { id: { in: sids }, companyId } });
    if (validServices !== sids.length) throw new BadRequestException('Unknown service');

    await tx.membershipRole.deleteMany({ where: { membershipId } });
    await tx.membershipRole.createMany({ data: roles.map((r) => ({ membershipId, roleId: r.roleId, serviceId: r.serviceId ?? null })) });
    await tx.serviceAssignment.deleteMany({ where: { membershipId } });
    await tx.serviceAssignment.createMany({ data: serviceIds.map((serviceId) => ({ membershipId, serviceId, companyId })) });
    await this.audit.log({ actor, companyId, action: 'ROLE_CHANGED', entityType: 'membership', entityId: membershipId, newValue: { roles, serviceIds } }, tx);
  }

  /** Prevent privilege escalation: you can only grant roles whose permissions you hold company-wide. */
  async checkAssignable(t: TenantContext, roles: RoleAssignmentDto[]) {
    if (t.actor.isMasterAdmin) return;
    const mine = new Set(t.permissionsFor());
    const rows = await this.prisma.role.findMany({ where: { id: { in: roles.map((r) => r.roleId) } } });
    const bad = rows.find((r) => r.permissions.some((p) => !mine.has(p)));
    if (bad) throw new ForbiddenException(`You cannot assign role ${bad.name}`);
    if (rows.some((r) => r.allServices)) {
      const total = await this.prisma.service.count({ where: { companyId: t.companyId } });
      if (t.allowedServiceIds.length < total) throw new ForbiddenException('You cannot grant access to all services');
    }
  }
}
