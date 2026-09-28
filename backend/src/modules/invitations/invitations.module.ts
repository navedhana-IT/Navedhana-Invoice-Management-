import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, GoneException, HttpCode, Injectable, Module,
  NotFoundException, Post, Query, Req, Res, UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Prisma, type Invitation } from '@prisma/client';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength,
} from 'class-validator';
import { createHash, randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import { env } from '../../config/env';
import { Public, RequirePermission, Tenant } from '../../common/decorators';
import { pageArgs, PageQuery, toPage } from '../../common/pagination';
import { assertLimit } from '../../common/plan-limits';
import { Mailer, webUrl } from '../../infra/mail.service';
import { PrismaService } from '../../infra/prisma.service';
import type { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from '../audit/audit.service';
import { meta, setSessionCookies } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PASSWORD, PASSWORD_MESSAGE } from '../../common/password';
import { UsersModule } from '../users/users.module';
import { UsersService } from '../users/users.service';
import { IdParam, IsId, parseId, type Id } from '../../common/ids';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');

class InviteDto {
  @IsEmail({}, { message: 'Enter a valid email address' }) @MaxLength(200) email: string;
  @IsString() @MinLength(2) @MaxLength(120) fullName: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsArray() @ArrayMinSize(1, { message: 'Choose at least one role' }) @ArrayMaxSize(10) @IsId({ each: true }) roleIds: Id[];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsId({ each: true }) serviceIds?: Id[];
  @IsOptional() @IsId() departmentId?: Id;
  /** Link to an existing employee record instead of creating one. */
  @IsOptional() @IsId() employeeId?: Id;
}

class InvitationQuery extends PageQuery {
  @IsOptional() @IsIn(['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED']) status?: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
}

class TokenQuery {
  @IsString() @MinLength(20) @MaxLength(100) token: string;
}

class AcceptDto {
  @IsString() @MinLength(20) @MaxLength(100) token: string;
  /** Required when the invitee has no account yet. */
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) fullName?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @Matches(PASSWORD, { message: PASSWORD_MESSAGE }) password?: string;
}

const publicFields = {
  id: true, email: true, fullName: true, phone: true, roleIds: true, serviceIds: true, departmentId: true, employeeId: true,
  expiresAt: true, acceptedAt: true, revokedAt: true, createdAt: true, invitedById: true,
} satisfies Prisma.InvitationSelect;

export function invitationStatus(i: Pick<Invitation, 'acceptedAt' | 'revokedAt' | 'expiresAt'>, now = new Date()) {
  if (i.acceptedAt) return 'ACCEPTED';
  if (i.revokedAt) return 'REVOKED';
  return i.expiresAt < now ? 'EXPIRED' : 'PENDING';
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
    private readonly mailer: Mailer,
    private readonly notifications: NotificationsService,
  ) {}

  async list(t: TenantContext, q: InvitationQuery) {
    const now = new Date();
    const status: Record<string, Prisma.InvitationWhereInput> = {
      PENDING: { acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
      ACCEPTED: { acceptedAt: { not: null } },
      REVOKED: { revokedAt: { not: null }, acceptedAt: null },
      EXPIRED: { acceptedAt: null, revokedAt: null, expiresAt: { lte: now } },
    };
    const where: Prisma.InvitationWhereInput = {
      companyId: t.companyId,
      ...(q.status && status[q.status]),
      ...(q.search && { OR: [{ email: { contains: q.search, mode: 'insensitive' } }, { fullName: { contains: q.search, mode: 'insensitive' } }] }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.invitation.findMany({ where, select: publicFields, ...pageArgs(q), orderBy: { createdAt: 'desc' } }),
      this.prisma.invitation.count({ where }),
    ]);
    return toPage(rows.map((r) => ({ ...r, status: invitationStatus(r, now) })), total, q);
  }

  async create(t: TenantContext, dto: InviteDto) {
    const email = dto.email.toLowerCase().trim();
    const serviceIds = [...new Set(dto.serviceIds ?? [])];
    await this.users.checkAssignable(t, dto.roleIds.map((roleId) => ({ roleId })));
    serviceIds.forEach((sid) => t.assertService('user.create', sid));
    await this.checkRefs(t, dto);
    const member = await this.prisma.membership.findFirst({ where: { companyId: t.companyId, user: { email }, status: 'ACTIVE' } });
    if (member) throw new ConflictException('This person is already a member of your company');

    const token = newToken();
    const inv = await this.prisma.$transaction(async (tx) => {
      // Company row lock (inside assertLimit) serialises invites, so the pending check below can't race.
      await assertLimit(tx, t.companyId, 'maxUsers');
      await tx.invitation.updateMany({ where: { companyId: t.companyId, email, acceptedAt: null, revokedAt: null, expiresAt: { lte: new Date() } }, data: { revokedAt: new Date() } });
      if (await tx.invitation.findFirst({ where: { companyId: t.companyId, email, acceptedAt: null, revokedAt: null } })) {
        throw new ConflictException('An invitation is already pending for this email. Resend it instead');
      }
      const created = await tx.invitation.create({
        data: {
          companyId: t.companyId, email, fullName: dto.fullName, phone: dto.phone, roleIds: dto.roleIds, serviceIds,
          departmentId: dto.departmentId, employeeId: dto.employeeId, tokenHash: sha256(token), expiresAt: expiry(), invitedById: t.userId,
        },
        select: publicFields,
      });
      await this.audit.log({ actor: t.actor, companyId: t.companyId, action: 'USER_INVITED', entityType: 'invitation', entityId: created.id, newValue: { email, roleIds: dto.roleIds, serviceIds } }, tx);
      return created;
    });
    await this.sendMail(t, inv, token);
    return { ...inv, status: 'PENDING' };
  }

  /** Rotates the token (old links stop working) and restarts the expiry window. */
  async resend(t: TenantContext, id: Id) {
    const inv = await this.owned(t, id);
    if (inv.acceptedAt) throw new ConflictException('This invitation was already accepted');
    if (inv.revokedAt) throw new ConflictException('This invitation was revoked. Create a new one instead');
    const token = newToken();
    const updated = await this.prisma.invitation.update({ where: { id }, data: { tokenHash: sha256(token), expiresAt: expiry() }, select: publicFields });
    await this.audit.log({ actor: t.actor, companyId: t.companyId, action: 'INVITATION_RESENT', entityType: 'invitation', entityId: id });
    await this.sendMail(t, updated, token);
    return { ...updated, status: 'PENDING' };
  }

  async revoke(t: TenantContext, id: Id) {
    const inv = await this.owned(t, id);
    if (inv.acceptedAt) throw new ConflictException('This invitation was already accepted. Deactivate the member instead');
    if (!inv.revokedAt) {
      await this.prisma.invitation.update({ where: { id }, data: { revokedAt: new Date() } });
      await this.audit.log({ actor: t.actor, companyId: t.companyId, action: 'INVITATION_REVOKED', entityType: 'invitation', entityId: id, previousValue: { email: inv.email } });
    }
  }

  async lookup(token: string) {
    const inv = await this.byToken(token);
    const [company, account] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({ where: { id: inv.companyId }, select: { displayName: true } }),
      this.prisma.user.findUnique({ where: { email: inv.email }, select: { id: true } }),
    ]);
    return { company: company.displayName, email: inv.email, fullName: inv.fullName, phone: inv.phone, accountExists: !!account, expiresAt: inv.expiresAt };
  }

  /**
   * Single use: the invitation row is claimed with a conditional update, so two concurrent accepts
   * can't both succeed. Existing accounts must be signed in as the invited email.
   */
  async accept(dto: AcceptDto, signedInUserId: Id | undefined) {
    const inv = await this.byToken(dto.token);
    const existing = await this.prisma.user.findUnique({ where: { email: inv.email } });
    if (existing) {
      if (existing.id !== signedInUserId) throw new UnauthorizedException({ code: 'SIGN_IN_REQUIRED', message: `Sign in as ${inv.email} to accept this invitation` });
      if (existing.status !== 'ACTIVE') throw new ForbiddenException('This account is disabled');
    } else if (!dto.password || !dto.fullName) {
      throw new BadRequestException('Enter your name and choose a password to create your account');
    }

    const userId = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.invitation.updateMany({
        where: { id: inv.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count !== 1) throw new ConflictException('This invitation has already been used');
      const user = existing ?? await tx.user.create({
        data: { email: inv.email, fullName: dto.fullName!, phone: dto.phone ?? inv.phone, passwordHash: await AuthService.hashPassword(dto.password!) },
      });
      const actor = { userId: user.id, isMasterAdmin: false };
      const membership = await tx.membership.upsert({
        where: { companyId_userId: { companyId: inv.companyId, userId: user.id } },
        create: { companyId: inv.companyId, userId: user.id },
        update: { status: 'ACTIVE' },
      });
      // Roles and services are re-validated against the company at acceptance time.
      const validServices = (await tx.service.findMany({ where: { id: { in: inv.serviceIds }, companyId: inv.companyId }, select: { id: true } })).map((s) => s.id);
      await this.users.setAccess(tx, inv.companyId, membership.id, inv.roleIds.map((roleId) => ({ roleId })), validServices, actor);
      if (inv.employeeId) {
        await tx.employee.updateMany({ where: { id: inv.employeeId, companyId: inv.companyId, userId: null }, data: { userId: user.id } });
      } else if (inv.departmentId) {
        const dept = await tx.department.findFirst({ where: { id: inv.departmentId, companyId: inv.companyId } });
        await tx.employee.create({
          data: { companyId: inv.companyId, serviceId: dept?.serviceId, departmentId: dept?.id, userId: user.id, fullName: user.fullName, email: user.email, phone: user.phone },
        });
      }
      if (!existing) await this.audit.log({ actor, companyId: inv.companyId, action: 'USER_CREATED', entityType: 'user', entityId: user.id, newValue: { email: user.email } }, tx);
      await this.audit.log({ actor, companyId: inv.companyId, action: 'INVITATION_ACCEPTED', entityType: 'invitation', entityId: inv.id }, tx);
      return user.id;
    });

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { fullName: true } });
    await this.notifications.notifyUsers([inv.invitedById], {
      companyId: inv.companyId, type: 'INVITATION_ACCEPTED', title: 'Invitation accepted', body: `${user.fullName} joined your company`, link: '/app/users',
    });
    return { userId, companyId: inv.companyId };
  }

  private async byToken(token: string) {
    const inv = await this.prisma.invitation.findUnique({ where: { tokenHash: sha256(token) } });
    if (!inv) throw new NotFoundException('This invitation link is not valid. Ask for a new invitation');
    if (inv.acceptedAt) throw new ConflictException({ code: 'INVITATION_USED', message: 'This invitation has already been used. Sign in instead' });
    if (inv.revokedAt) throw new GoneException({ code: 'INVITATION_REVOKED', message: 'This invitation was cancelled. Ask for a new invitation' });
    if (inv.expiresAt < new Date()) throw new GoneException({ code: 'INVITATION_EXPIRED', message: 'This invitation has expired. Ask for a new invitation' });
    return inv;
  }

  private async owned(t: TenantContext, id: Id) {
    const inv = await this.prisma.invitation.findFirst({ where: { id, companyId: t.companyId } });
    if (!inv) throw new NotFoundException('Invitation not found');
    return inv;
  }

  private async checkRefs(t: TenantContext, dto: InviteDto) {
    const roles = await this.prisma.role.count({ where: { id: { in: dto.roleIds }, OR: [{ companyId: null }, { companyId: t.companyId }] } });
    if (roles !== new Set(dto.roleIds).size) throw new BadRequestException('One of the selected roles no longer exists');
    if (dto.departmentId && !(await this.prisma.department.findFirst({ where: { id: dto.departmentId, companyId: t.companyId } }))) {
      throw new BadRequestException('The selected department no longer exists');
    }
    if (dto.employeeId) {
      const emp = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, companyId: t.companyId } });
      if (!emp) throw new BadRequestException('The selected employee no longer exists');
      if (emp.userId) throw new ConflictException('This employee already has a login');
    }
  }

  private async sendMail(t: TenantContext, inv: { email: string; expiresAt: Date }, token: string) {
    const [inviter, company] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: t.userId }, select: { fullName: true } }),
      this.prisma.company.findUniqueOrThrow({ where: { id: t.companyId }, select: { displayName: true, timezone: true } }),
    ]);
    await this.mailer.send({
      template: 'invitation', to: inv.email,
      data: {
        inviter: inviter.fullName, company: company.displayName, url: webUrl(`/invite/${token}`),
        expiresAt: inv.expiresAt.toLocaleString('en-IN', { timeZone: company.timezone, dateStyle: 'medium', timeStyle: 'short' }),
      },
    });
  }
}

const expiry = () => new Date(Date.now() + env().INVITE_TTL_HOURS * 3600_000);

@ApiTags('invitations')
@Controller('invitations')
class InvitationsController {
  constructor(
    private readonly invitations: InvitationsService,
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
  ) {}

  @ApiBearerAuth()
  @Get()
  @RequirePermission('user.view')
  list(@Tenant() t: TenantContext, @Query() q: InvitationQuery) {
    return this.invitations.list(t, q);
  }

  @ApiBearerAuth()
  @Post()
  @RequirePermission('user.create')
  create(@Tenant() t: TenantContext, @Body() dto: InviteDto) {
    return this.invitations.create(t, dto);
  }

  @ApiBearerAuth()
  @Post(':id/resend')
  @HttpCode(200)
  @RequirePermission('user.create')
  resend(@Tenant() t: TenantContext, @IdParam() id: Id) {
    return this.invitations.resend(t, id);
  }

  @ApiBearerAuth()
  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('user.create')
  revoke(@Tenant() t: TenantContext, @IdParam() id: Id) {
    return this.invitations.revoke(t, id);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('lookup')
  lookup(@Query() q: TokenQuery) {
    return this.invitations.lookup(q.token);
  }

  /** Public, but an existing account must send its access token so we know it's really them. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('accept')
  @HttpCode(200)
  async accept(@Body() dto: AcceptDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const signedIn = bearer ? await this.jwt.verifyAsync<{ sub: string }>(bearer).then((p) => parseId(p.sub), () => undefined) : undefined;
    const { userId, companyId } = await this.invitations.accept(dto, signedIn);
    const session = await this.auth.startSession(userId, meta(req));
    return { ...setSessionCookies(res, session), companyId };
  }
}

@Module({ imports: [UsersModule], controllers: [InvitationsController], providers: [InvitationsService] })
export class InvitationsModule {}
