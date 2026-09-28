import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC, MASTER_ADMIN, PERMISSION, READ_ONLY, type AuthedRequest } from '../common/decorators';
import { parseId, type Id } from '../common/ids';
import type { Permission } from '../common/permissions';
import { PrismaService } from '../infra/prisma.service';
import { TenantContextFactory } from './tenant-context.factory';

/**
 * Global guard, runs on every request:
 *   authenticated user -> master admin check -> company context -> service context -> permission.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly tenants: TenantContextFactory,
  ) {}

  private meta<T>(key: string, ctx: ExecutionContext) {
    return this.reflector.getAllAndOverride<T>(key, [ctx.getHandler(), ctx.getClass()]);
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.meta<boolean>(IS_PUBLIC, ctx)) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();

    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException();
    let userId: Id | undefined;
    try {
      userId = parseId((await this.jwt.verifyAsync<{ sub: string }>(token)).sub);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    if (!userId) throw new UnauthorizedException('Invalid or expired token');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { status: true, isMasterAdmin: true } });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException();

    req.actor = { userId, isMasterAdmin: user.isMasterAdmin, ip: req.ip, userAgent: req.headers['user-agent'] };

    if (this.meta<boolean>(MASTER_ADMIN, ctx) && !user.isMasterAdmin) throw new ForbiddenException();

    const permission = this.meta<Permission | '*'>(PERMISSION, ctx);
    if (!permission) return true;

    const rawService = header(req, 'x-service-id');
    const companyId = parseId(header(req, 'x-company-id'));
    const serviceId = parseId(rawService);
    if (!companyId) throw new BadRequestException('X-Company-Id header required');
    if (rawService && !serviceId) throw new BadRequestException('Invalid X-Service-Id');

    // Member-only routes (context, notifications) keep working after a trial lapses.
    const write = permission !== '*' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !this.meta<boolean>(READ_ONLY, ctx);
    req.tenant = await this.tenants.build(req.actor, companyId, serviceId, write);
    if (permission !== '*' && !req.tenant.hasAny(permission)) throw new ForbiddenException(`Missing permission ${permission}`);
    return true;
  }
}

const header = (req: AuthedRequest, name: string) => {
  const v = req.headers[name];
  return (Array.isArray(v) ? v[0] : v) || undefined;
};
