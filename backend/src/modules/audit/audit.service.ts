import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Actor } from '../../common/decorators';
import { dateRange, orderBy, pageArgs, PageQuery, toPage } from '../../common/pagination';
import { PrismaService } from '../../infra/prisma.service';
import { parseId, type Id } from '../../common/ids';

export type AuditAction =
  | 'USER_LOGIN' | 'USER_LOGIN_FAILED' | 'USER_CREATED' | 'USER_UPDATED' | 'ROLE_CREATED' | 'ROLE_UPDATED'
  | 'ROLE_DELETED' | 'ROLE_CHANGED' | 'COMPANY_CREATED' | 'COMPANY_UPDATED' | 'COMPANY_ACTIVATED'
  | 'COMPANY_DEACTIVATED' | 'PLAN_CREATED' | 'SERVICE_CREATED' | 'SERVICE_UPDATED' | 'SERVICE_DELETED'
  | 'RECORD_CREATED' | 'RECORD_UPDATED' | 'RECORD_DELETED' | 'INVOICE_CREATED' | 'INVOICE_UPDATED'
  | 'INVOICE_ISSUED' | 'INVOICE_CANCELLED' | 'INVOICE_VOIDED' | 'INVOICE_DELETED' | 'SCHEDULE_UPDATED'
  | 'PAYMENT_CREATED' | 'PAYMENT_REFUNDED' | 'PAYMENT_REVERSED' | 'PDF_REGENERATED' | 'TEMPLATE_CREATED'
  | 'TEMPLATE_UPDATED' | 'TEMPLATE_PUBLISHED' | 'TEMPLATE_DEFAULT_SET' | 'TEMPLATE_DELETED' | 'DOCUMENT_UPLOADED'
  | 'PLAN_UPDATED' | 'PLAN_ACTIVATED' | 'PLAN_DEACTIVATED' | 'PLANS_REORDERED' | 'PLAN_DELETED' | 'SUBSCRIPTION_UPDATED'
  | 'USER_ACTIVATED' | 'USER_DEACTIVATED' | 'COMPANY_REGISTERED' | 'USER_INVITED' | 'INVITATION_RESENT'
  | 'INVITATION_REVOKED' | 'INVITATION_ACCEPTED' | 'PASSWORD_RESET_REQUESTED' | 'PASSWORD_RESET' | 'PASSWORD_CHANGED'
  | 'MEMBER_REMOVED' | 'PROFILE_UPDATED' | 'TEMPLATE_DUPLICATED' | 'LOGOUT' | 'INVOICE_SENT';

export interface AuditEvent {
  actor?: Actor;
  companyId?: Id | null;
  serviceId?: Id | null;
  action: AuditAction;
  entityType: string;
  entityId?: Id | null;
  previousValue?: unknown;
  newValue?: unknown;
}

type Tx = Prisma.TransactionClient;

/** Append-only. There are intentionally no update/delete methods (also blocked by a DB trigger). */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  async log(e: AuditEvent, tx: Tx = this.prisma) {
    await tx.auditLog.create({
      data: {
        actorUserId: e.actor?.userId,
        companyId: e.companyId ?? undefined,
        serviceId: e.serviceId ?? undefined,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId ?? undefined,
        previousValue: json(e.previousValue),
        newValue: json(e.newValue),
        ip: e.actor?.ip,
        userAgent: e.actor?.userAgent?.slice(0, 500),
      },
    });
    this.logger.log(`${e.action} ${e.entityType}:${e.entityId ?? '-'} by ${e.actor?.userId ?? 'system'}`);
  }

  /** `companyId` (tenant scope) always wins over q.companyId, which only the master admin route honours. */
  async list(q: PageQuery & { action?: string; entityType?: string; actorUserId?: Id; companyId?: Id; from?: Date; to?: Date }, companyId?: Id) {
    const where: Prisma.AuditLogWhereInput = {
      ...((companyId ?? q.companyId) && { companyId: companyId ?? q.companyId }),
      ...(q.action && { action: q.action }),
      ...(q.entityType && { entityType: q.entityType }),
      ...(q.actorUserId && { actorUserId: q.actorUserId }),
      ...(dateRange(q.from, q.to) && { createdAt: dateRange(q.from, q.to) }),
      ...(q.search && {
        OR: [
          { action: { contains: q.search.trim().replace(/\s+/g, '_'), mode: 'insensitive' } },
          { entityType: { contains: q.search, mode: 'insensitive' } },
          ...(parseId(q.search.trim()) ? [{ entityId: parseId(q.search.trim()) }] : []),
        ],
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, ...pageArgs(q), orderBy: orderBy(q, ['createdAt', 'action']) }),
      this.prisma.auditLog.count({ where }),
    ]);
    const ids = [...new Set(data.map((d) => d.actorUserId).filter((id): id is Id => !!id))];
    const actors = new Map((await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, fullName: true } })).map((u) => [u.id, u]));
    return toPage(data.map((d) => ({ ...d, actor: d.actorUserId ? actors.get(d.actorUserId) ?? null : null })), total, q);
  }
}

const SECRET_KEYS = /password|token|secret/i;
function json(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined || v === null) return undefined;
  return JSON.parse(JSON.stringify(v, (k, val) => (SECRET_KEYS.test(k) ? '[redacted]' : val)));
}
