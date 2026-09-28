import { Global, Injectable, Logger, Module } from '@nestjs/common';
import type { Permission } from '../../common/permissions';
import { Mailer, webUrl } from '../../infra/mail.service';
import { PrismaService } from '../../infra/prisma.service';
import { Realtime } from '../../infra/realtime';
import type { Id } from '../../common/ids';

export type NotificationType =
  | 'INVOICE_ISSUED' | 'PAYMENT_RECEIVED' | 'PAYMENT_MADE' | 'INVOICE_OVERDUE' | 'INVITATION_ACCEPTED'
  | 'COMPANY_ACTIVATED' | 'TRIAL_ENDING' | 'TEMPLATE_PUBLISHED' | 'PDF_READY';

/** Types that also go out by email to users who keep email notifications on. */
const EMAILED: ReadonlySet<NotificationType> = new Set(['PAYMENT_RECEIVED', 'INVOICE_OVERDUE', 'TRIAL_ENDING', 'COMPANY_ACTIVATED']);

export interface NotificationInput {
  companyId: Id;
  serviceId?: Id | null;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: Realtime,
    private readonly mailer: Mailer,
  ) {}

  /** Best effort: a notification failure never fails the business action that triggered it. */
  async notifyUsers(userIds: Id[], n: NotificationInput) {
    const ids = [...new Set(userIds)];
    if (!ids.length) return;
    try {
      const rows = await this.prisma.notification.createManyAndReturn({
        data: ids.map((userId) => ({ userId, companyId: n.companyId, serviceId: n.serviceId ?? null, type: n.type, title: n.title, body: n.body, link: n.link })),
      });
      for (const row of rows) this.realtime.toUsers([row.userId], 'notification', row);
      if (EMAILED.has(n.type)) await this.email(ids, n);
    } catch (e) {
      this.logger.warn(`Notify ${n.type} failed: ${(e as Error).message}`);
    }
  }

  /** Everyone in the company who holds `permission` for the service (or anywhere, when serviceId is null). */
  async notifyPermission(permission: Permission, n: NotificationInput, excludeUserId?: Id) {
    const users = await this.recipients(n.companyId, n.serviceId ?? null, permission);
    return this.notifyUsers(users.filter((u) => u !== excludeUserId), n);
  }

  async recipients(companyId: Id, serviceId: Id | null, permission: Permission) {
    const members = await this.prisma.membership.findMany({
      where: { companyId, status: 'ACTIVE', user: { status: 'ACTIVE' } },
      select: { userId: true, roles: { select: { serviceId: true, role: { select: { permissions: true, allServices: true } } } }, serviceAssignments: { select: { serviceId: true } } },
    });
    return members.filter((m) => m.roles.some((r) => {
      if (!r.role.permissions.includes(permission)) return false;
      if (r.serviceId) return !serviceId || r.serviceId === serviceId;
      return !serviceId || r.role.allServices || m.serviceAssignments.some((a) => a.serviceId === serviceId);
    })).map((m) => m.userId);
  }

  private async email(userIds: Id[], n: NotificationInput) {
    const [users, company] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: userIds }, emailNotifications: true, status: 'ACTIVE' }, select: { email: true } }),
      this.prisma.company.findUnique({ where: { id: n.companyId }, select: { displayName: true } }),
    ]);
    for (const u of users) {
      await this.mailer.send({ template: 'notification', to: u.email, data: { title: n.title, body: n.body ?? '', url: n.link ? webUrl(n.link) : undefined, company: company?.displayName ?? '' } });
    }
  }
}

@Global()
@Module({ providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsCoreModule {}
