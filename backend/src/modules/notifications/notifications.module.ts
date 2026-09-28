import { Controller, Get, HttpCode, Module, NotFoundException, Post, Query } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OnGatewayConnection, WebSocketGateway } from '@nestjs/websockets';
import { Prisma } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import type { Socket } from 'socket.io';
import { env } from '../../config/env';
import { Tenant, TenantMember } from '../../common/decorators';
import { pageArgs, PageQuery, toPage } from '../../common/pagination';
import { PrismaService } from '../../infra/prisma.service';
import { userRoom } from '../../infra/realtime';
import type { TenantContext } from '../../tenancy/tenant-context';
import { IdParam, parseId, type Id } from '../../common/ids';

class NotificationQuery extends PageQuery {
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() unread?: boolean;
}

/** All routes are scoped to the signed-in user and the X-Company-Id company. */
@ApiTags('notifications')
@ApiBearerAuth()
@TenantMember()
@Controller('notifications')
class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Tenant() t: TenantContext, @Query() q: NotificationQuery) {
    const where: Prisma.NotificationWhereInput = { userId: t.userId, companyId: t.companyId, ...(q.unread && { readAt: null }) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({ where, ...pageArgs(q), orderBy: { createdAt: 'desc' } }),
      this.prisma.notification.count({ where }),
    ]);
    return toPage(data, total, q);
  }

  @Get('unread-count')
  async unread(@Tenant() t: TenantContext) {
    return { count: await this.prisma.notification.count({ where: { userId: t.userId, companyId: t.companyId, readAt: null } }) };
  }

  @Post('read-all')
  @HttpCode(200)
  async readAll(@Tenant() t: TenantContext) {
    const r = await this.prisma.notification.updateMany({ where: { userId: t.userId, companyId: t.companyId, readAt: null }, data: { readAt: new Date() } });
    return { updated: r.count };
  }

  @Post(':id/read')
  @HttpCode(200)
  read(@Tenant() t: TenantContext, @IdParam() id: Id) {
    return this.mark(t, id, new Date());
  }

  @Post(':id/unread')
  @HttpCode(200)
  unreadOne(@Tenant() t: TenantContext, @IdParam() id: Id) {
    return this.mark(t, id, null);
  }

  private async mark(t: TenantContext, id: Id, readAt: Date | null) {
    const r = await this.prisma.notification.updateMany({ where: { id, userId: t.userId, companyId: t.companyId }, data: { readAt } });
    if (!r.count) throw new NotFoundException('Notification not found');
    return { id, readAt };
  }
}

/**
 * Handshake must carry a valid access token (auth.token). Sockets join only their own user room;
 * events carry companyId and the client ignores other companies.
 */
// addTrailingSlash: false so `/socket.io` also matches when a proxy (the Next.js rewrite) strips the trailing slash.
@WebSocketGateway({
  addTrailingSlash: false,
  cors: { origin: (_origin: string | undefined, cb: (err: Error | null, allow?: string[]) => void) => cb(null, env().CORS_ORIGINS.split(',').map((o) => o.trim())), credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection {
  constructor(private readonly jwt: JwtService, private readonly prisma: PrismaService) {}

  async handleConnection(socket: Socket) {
    try {
      const token = String(socket.handshake.auth?.token ?? '');
      const sub = parseId((await this.jwt.verifyAsync<{ sub: string }>(token)).sub);
      if (!sub) throw new Error('invalid subject');
      const user = await this.prisma.user.findUnique({ where: { id: sub }, select: { status: true } });
      if (user?.status !== 'ACTIVE') throw new Error('inactive');
      await socket.join(userRoom(sub));
    } catch {
      socket.emit('unauthorized');
      socket.disconnect(true);
    }
  }
}

@Module({ controllers: [NotificationsController], providers: [RealtimeGateway] })
export class NotificationsModule {}
