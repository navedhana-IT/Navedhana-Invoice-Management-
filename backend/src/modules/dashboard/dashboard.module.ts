import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InvoiceStatus } from '@prisma/client';
import { Tenant, TenantMember } from '../../common/decorators';
import { D } from '../../common/money';
import { PrismaService } from '../../infra/prisma.service';
import type { TenantContext } from '../../tenancy/tenant-context';

const OPEN: InvoiceStatus[] = ['ISSUED', 'RECEIVED', 'PARTIALLY_PAID', 'OVERDUE'];

/** Company / service dashboard. Figures only cover services where the user can view invoices. */
@Injectable()
class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(t: TenantContext) {
    const services = t.serviceScope('invoice.view');
    const base = { companyId: t.companyId, serviceId: { in: services }, invoiceType: { not: 'PROFORMA' as const } };
    const now = new Date();
    const since = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth() + 1, 1));
    const [receivable, payable, byStatus, revenue, customers, vendors, employees, recent, upcoming, monthly] = await Promise.all([
      this.prisma.invoice.aggregate({ where: { ...base, direction: 'RECEIVABLE', status: { in: OPEN } }, _sum: { balanceAmount: true } }),
      this.prisma.invoice.aggregate({ where: { ...base, direction: 'PAYABLE', status: { in: OPEN } }, _sum: { balanceAmount: true } }),
      this.prisma.invoice.groupBy({ by: ['status'], where: { ...base, direction: 'RECEIVABLE' }, _count: { _all: true }, orderBy: { status: 'asc' } }),
      this.prisma.payment.aggregate({ where: { companyId: t.companyId, serviceId: { in: services }, status: 'SUCCESS', invoice: { direction: 'RECEIVABLE' } }, _sum: { amount: true } }),
      t.hasAny('customer.view') ? this.prisma.customer.count({ where: { companyId: t.companyId, status: 'ACTIVE' } }) : null,
      t.hasAny('vendor.view') ? this.prisma.vendor.count({ where: { companyId: t.companyId, status: 'ACTIVE' } }) : null,
      t.hasAny('employee.view') ? this.prisma.employee.count({ where: { companyId: t.companyId, status: 'ACTIVE' } }) : null,
      this.prisma.invoice.findMany({ where: base, orderBy: { createdAt: 'desc' }, take: 6, include: { customer: { select: { name: true } }, vendor: { select: { name: true } } } }),
      this.prisma.paymentScheduleItem.findMany({
        where: { companyId: t.companyId, status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] }, dueDate: { not: null }, invoice: { ...base, status: { in: OPEN } } },
        orderBy: { dueDate: 'asc' }, take: 6,
        include: { invoice: { select: { id: true, invoiceNumber: true, direction: true, customer: { select: { name: true } }, vendor: { select: { name: true } } } } },
      }),
      services.length
        ? this.prisma.$queryRaw<{ month: Date; invoiced: string; collected: string }[]>`
          SELECT m.month, COALESCE(i.v, 0)::text AS invoiced, COALESCE(p.v, 0)::text AS collected
          FROM generate_series(${since}::date, date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata'), '1 month') AS g(d) CROSS JOIN LATERAL (SELECT g.d::date AS month) m
          LEFT JOIN (SELECT date_trunc('month', "issueDate")::date mo, SUM(total) v FROM invoices WHERE "companyId" = ${t.companyId}::bigint AND "serviceId" = ANY(${services}::bigint[])
            AND direction = 'RECEIVABLE' AND "invoiceType" NOT IN ('PROFORMA','CREDIT_NOTE') AND status NOT IN ('DRAFT','CANCELLED','VOID') GROUP BY 1) i ON i.mo = m.month
          LEFT JOIN (SELECT date_trunc('month', p."paidAt" AT TIME ZONE 'Asia/Kolkata')::date mo, SUM(p.amount) v FROM payments p JOIN invoices inv ON inv.id = p."invoiceId" WHERE p."companyId" = ${t.companyId}::bigint
            AND p."serviceId" = ANY(${services}::bigint[]) AND p.status = 'SUCCESS' AND inv.direction = 'RECEIVABLE' GROUP BY 1) p ON p.mo = m.month
          ORDER BY 1`
        : [],
    ]);
    const counts = Object.fromEntries(byStatus.map((s) => [s.status, (s._count as { _all: number })._all]));
    return {
      revenue: D(revenue._sum.amount).toFixed(2),
      receivables: D(receivable._sum.balanceAmount).toFixed(2),
      payables: D(payable._sum.balanceAmount).toFixed(2),
      invoices: {
        outstanding: (counts.ISSUED ?? 0) + (counts.PARTIALLY_PAID ?? 0) + (counts.OVERDUE ?? 0),
        paid: counts.PAID ?? 0, partiallyPaid: counts.PARTIALLY_PAID ?? 0, overdue: counts.OVERDUE ?? 0, draft: counts.DRAFT ?? 0,
      },
      counts: { customers, vendors, employees, services: services.length },
      monthly,
      recent: recent.map((r) => ({ id: r.id, invoiceNumber: r.invoiceNumber, status: r.status, total: r.total, direction: r.direction, party: r.customer?.name ?? r.vendor?.name, createdAt: r.createdAt })),
      upcoming: upcoming.map((u) => ({ id: u.id, invoiceId: u.invoice.id, invoiceNumber: u.invoice.invoiceNumber, direction: u.invoice.direction, party: u.invoice.customer?.name ?? u.invoice.vendor?.name, stageNumber: u.stageNumber, dueDate: u.dueDate, balance: D(u.amount).minus(u.paidAmount).toFixed(2), status: u.status })),
    };
  }
}

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @TenantMember()
  summary(@Tenant() t: TenantContext) {
    return this.dashboard.summary(t);
  }
}

@Module({ controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
