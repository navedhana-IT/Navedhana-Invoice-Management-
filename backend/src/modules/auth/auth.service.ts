import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Mailer, webUrl } from '../../infra/mail.service';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { env } from '../../config/env';
import type { Actor } from '../../common/decorators';
import { PrismaService } from '../../infra/prisma.service';
import type { TenantContext } from '../../tenancy/tenant-context';
import { subscriptionLapsed } from '../../tenancy/tenant-context.factory';
import { AuditService } from '../audit/audit.service';
import type { Id } from '../../common/ids';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const REUSE_INTERVAL_MS = 30_000;
/** Groups one sign-in's rotated refresh tokens; random so families can't be guessed across users. */
const newFamily = () => randomBytes(16).toString('hex');

export interface Session {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly mailer: Mailer,
  ) {}

  static hashPassword(password: string) {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async login(email: string, password: string, meta: Pick<Actor, 'ip' | 'userAgent'>) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    const ok = user && user.status === 'ACTIVE' && (await argon2.verify(user.passwordHash, password));
    if (!ok) {
      await this.audit.log({
        actor: user ? { userId: user.id, isMasterAdmin: user.isMasterAdmin, ...meta } : undefined,
        action: 'USER_LOGIN_FAILED',
        entityType: 'user',
        entityId: user?.id,
        newValue: { email },
      });
      throw new UnauthorizedException('Invalid email or password');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({ actor: { userId: user.id, isMasterAdmin: user.isMasterAdmin, ...meta }, action: 'USER_LOGIN', entityType: 'user', entityId: user.id });
    return this.issue(user.id, newFamily(), meta);
  }

  /**
   * Rotates the refresh token. Reuse of a revoked token revokes the whole family, except within a short
   * reuse interval after rotation: parallel tabs, or a navigation that aborted the response carrying the
   * new cookie, would otherwise sign the user out everywhere. Logout, password changes and deactivation
   * revoke every token in the family, so nothing is reusable after them.
   */
  async refresh(token: string | undefined, meta: Pick<Actor, 'ip' | 'userAgent'>): Promise<Session> {
    if (!token) throw new UnauthorizedException();
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!row) throw new UnauthorizedException();
    if (row.expiresAt < new Date() || row.user.status !== 'ACTIVE') throw new UnauthorizedException();
    if (row.revokedAt) {
      const reusable = Date.now() - row.revokedAt.getTime() <= REUSE_INTERVAL_MS
        && (await this.prisma.refreshToken.count({ where: { family: row.family, revokedAt: null } })) > 0;
      if (!reusable) {
        await this.revokeFamily(row.family);
        throw new UnauthorizedException('Session revoked');
      }
      return this.issue(row.userId, row.family, meta);
    }
    await this.prisma.refreshToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: new Date() } });
    return this.issue(row.userId, row.family, meta);
  }

  async logout(token: string | undefined) {
    if (!token) return;
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: { select: { isMasterAdmin: true } } } });
    if (!row) return;
    await this.revokeFamily(row.family);
    await this.audit.log({ actor: { userId: row.userId, isMasterAdmin: row.user.isMasterAdmin }, action: 'LOGOUT', entityType: 'user', entityId: row.userId });
  }

  /** Always succeeds from the caller's view so the endpoint can't be used to discover accounts. */
  async forgotPassword(email: string, meta: Pick<Actor, 'ip' | 'userAgent'>) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user || user.status !== 'ACTIVE') return;
    const token = randomBytes(32).toString('base64url');
    const minutes = env().RESET_TTL_MINUTES;
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
      this.prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + minutes * 60_000) } }),
    ]);
    await this.audit.log({ actor: { userId: user.id, isMasterAdmin: user.isMasterAdmin, ...meta }, action: 'PASSWORD_RESET_REQUESTED', entityType: 'user', entityId: user.id });
    await this.mailer.send({ template: 'password-reset', to: user.email, data: { name: user.fullName, url: webUrl(`/reset-password/${token}`), minutes } });
  }

  /** Single use: the token is claimed with a conditional update. Every existing session is signed out. */
  async resetPassword(token: string, password: string, meta: Pick<Actor, 'ip' | 'userAgent'>) {
    const row = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!row || row.usedAt || row.expiresAt < new Date() || row.user.status !== 'ACTIVE') {
      throw new BadRequestException({ code: 'RESET_LINK_INVALID', message: 'This reset link is invalid or has expired. Request a new one' });
    }
    const passwordHash = await AuthService.hashPassword(password);
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
      if (claimed.count !== 1) throw new BadRequestException({ code: 'RESET_LINK_INVALID', message: 'This reset link has already been used. Request a new one' });
      await tx.user.update({ where: { id: row.userId }, data: { passwordHash } });
      await tx.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log({ actor: { userId: row.userId, isMasterAdmin: row.user.isMasterAdmin, ...meta }, action: 'PASSWORD_RESET', entityType: 'user', entityId: row.userId }, tx);
    });
    await this.mailer.send({ template: 'password-changed', to: row.user.email, data: { name: row.user.fullName } });
    return this.startSession(row.userId, meta);
  }

  async changePassword(userId: Id, current: string, next: string, meta: Pick<Actor, 'ip' | 'userAgent'>) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await argon2.verify(user.passwordHash, current))) throw new BadRequestException({ code: 'WRONG_PASSWORD', message: 'Your current password is incorrect' });
    if (current === next) throw new BadRequestException('Choose a password different from your current one');
    const passwordHash = await AuthService.hashPassword(next);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log({ actor: { userId, isMasterAdmin: user.isMasterAdmin, ...meta }, action: 'PASSWORD_CHANGED', entityType: 'user', entityId: userId }, tx);
    });
    await this.mailer.send({ template: 'password-changed', to: user.email, data: { name: user.fullName } });
    return this.startSession(userId, meta);
  }

  async updateProfile(userId: Id, dto: { fullName?: string; phone?: string; emailNotifications?: boolean }) {
    await this.prisma.user.update({ where: { id: userId }, data: dto });
    await this.audit.log({ actor: { userId, isMasterAdmin: false }, action: 'PROFILE_UPDATED', entityType: 'user', entityId: userId, newValue: dto });
    return this.me(userId);
  }

  private revokeFamily(family: string) {
    return this.prisma.refreshToken.updateMany({ where: { family, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  /** New session for a user who just proved who they are another way (signup, invitation, password reset). */
  startSession(userId: Id, meta: Pick<Actor, 'ip' | 'userAgent'>) {
    return this.issue(userId, newFamily(), meta);
  }

  private async issue(userId: Id, family: string, meta: Pick<Actor, 'ip' | 'userAgent'>): Promise<Session> {
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + env().REFRESH_TTL_DAYS * 86_400_000);
    await this.prisma.refreshToken.create({
      data: { userId, family, tokenHash: sha256(refreshToken), expiresAt: refreshExpiresAt, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 500) },
    });
    const accessToken = await this.jwt.signAsync({ sub: String(userId) });
    return { accessToken, refreshToken, refreshExpiresAt };
  }

  me(userId: Id) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true, email: true, fullName: true, phone: true, isMasterAdmin: true, emailNotifications: true,
        memberships: {
          where: { status: 'ACTIVE', company: { status: 'ACTIVE' } },
          select: { company: { select: { id: true, slug: true, displayName: true } }, roles: { select: { role: { select: { name: true } } } } },
        },
      },
    });
  }

  async context(t: TenantContext) {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: t.companyId },
      select: {
        id: true, slug: true, legalName: true, displayName: true, status: true, subscriptionStatus: true, trialEndsAt: true, timezone: true,
        plan: { select: { code: true, name: true, features: true, limits: true } },
      },
    });
    const services = await this.prisma.service.findMany({
      where: { id: { in: t.allowedServiceIds }, status: 'ACTIVE' },
      select: { id: true, slug: true, name: true, displayName: true, logoKey: true, code: true, state: true },
      orderBy: { name: 'asc' },
    });
    const readOnly = !t.actor.isMasterAdmin && subscriptionLapsed(company);
    return { company: { ...company, readOnly }, services, permissions: t.permissionsFor(t.serviceId), isMasterAdmin: t.actor.isMasterAdmin };
  }
}
