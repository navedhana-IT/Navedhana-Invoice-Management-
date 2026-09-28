import { BadRequestException, Injectable } from '@nestjs/common';
import { InvoiceDirection, InvoiceStatus, Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional } from 'class-validator';
import { D } from '../../common/money';
import { PrismaService } from '../../infra/prisma.service';
import type { TenantContext } from '../../tenancy/tenant-context';
import { IsId, type Id } from '../../common/ids';

export class ReportQuery {
  @IsOptional() @Type(() => Date) @IsDate() from?: Date;
  @IsOptional() @Type(() => Date) @IsDate() to?: Date;
  @IsOptional() @IsId() serviceId?: Id;
  @IsOptional() @IsId() customerId?: Id;
  @IsOptional() @IsId() vendorId?: Id;
  @IsOptional() @IsEnum(InvoiceStatus) status?: InvoiceStatus;
}

export const REPORT_TYPES = ['sales', 'purchases', 'receivables', 'payables', 'outstanding', 'payments', 'tax', 'revenue', 'by-service', 'employees'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

const CLOSED: InvoiceStatus[] = ['DRAFT', 'CANCELLED', 'VOID'];
const OPEN: InvoiceStatus[] = ['ISSUED', 'RECEIVED', 'PARTIALLY_PAID', 'OVERDUE'];
const money = (v: Prisma.Decimal | null | undefined) => (v ?? D(0)).toFixed(2);

/** All reports are tenant + service scoped and computed from stored backend totals. Proforma invoices are excluded. */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  run(t: TenantContext, type: ReportType, q: ReportQuery) {
    const services = t.serviceScope('report.view').filter((id) => !q.serviceId || id === q.serviceId);
    switch (type) {
      case 'sales': return this.invoiceReport(t, services, q, 'RECEIVABLE', false);
      case 'purchases': return this.invoiceReport(t, services, q, 'PAYABLE', false);
      case 'receivables': return this.invoiceReport(t, services, q, 'RECEIVABLE', true);
      case 'payables': return this.invoiceReport(t, services, q, 'PAYABLE', true);
      case 'outstanding': return this.invoiceReport(t, services, { ...q, status: 'OVERDUE' }, undefined, true);
      case 'payments': return this.payments(t, services, q);
      case 'tax': return this.tax(t, services, q);
      case 'revenue': return this.revenue(t, services, q);
      case 'by-service': return this.byService(t, services, q);
      case 'employees': return this.employees(t);
      default: throw new BadRequestException('Unknown report');
    }
  }

  private where(t: TenantContext, services: Id[], q: ReportQuery, direction?: InvoiceDirection, openOnly = false): Prisma.InvoiceWhereInput {
    return {
      companyId: t.companyId, serviceId: { in: services }, invoiceType: { not: 'PROFORMA' },
      ...(direction && { direction }),
      status: q.status ? q.status : openOnly ? { in: OPEN } : { notIn: CLOSED },
      ...(q.customerId && { customerId: q.customerId }),
      ...(q.vendorId && { vendorId: q.vendorId }),
      ...((q.from || q.to) && { issueDate: { gte: q.from, lte: q.to } }),
    };
  }

  private async invoiceReport(t: TenantContext, services: Id[], q: ReportQuery, direction: InvoiceDirection | undefined, withAging: boolean) {
    const where = this.where(t, services, q, direction, withAging);
    const [rows, agg] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where, orderBy: { issueDate: 'desc' }, take: 1000,
        select: { id: true, invoiceNumber: true, invoiceType: true, direction: true, status: true, issueDate: true, dueDate: true, total: true, taxTotal: true, paidAmount: true, balanceAmount: true,
          customer: { select: { name: true } }, vendor: { select: { name: true } }, service: { select: { name: true } },
          schedule: { where: { status: { not: 'PAID' } }, orderBy: { dueDate: 'asc' }, take: 1, select: { dueDate: true } } },
      }),
      this.prisma.invoice.aggregate({ where, _count: true, _sum: { subtotal: true, taxTotal: true, total: true, paidAmount: true, balanceAmount: true } }),
    ]);
    const today = Date.now();
    const aging = { current: D(0), d1_30: D(0), d31_60: D(0), d61_90: D(0), d90_plus: D(0) };
    const data = rows.map(({ schedule, ...r }) => {
      const due = schedule[0]?.dueDate ?? r.dueDate;
      const days = due ? Math.floor((today - due.getTime()) / 86_400_000) : 0;
      if (withAging) {
        const bucket = days <= 0 ? 'current' : days <= 30 ? 'd1_30' : days <= 60 ? 'd31_60' : days <= 90 ? 'd61_90' : 'd90_plus';
        aging[bucket] = aging[bucket].plus(r.balanceAmount);
      }
      return { ...r, party: r.customer?.name ?? r.vendor?.name, service: r.service.name, nextDueDate: due, daysOverdue: Math.max(days, 0) };
    });
    return {
      summary: { count: agg._count, subtotal: money(agg._sum.subtotal), tax: money(agg._sum.taxTotal), total: money(agg._sum.total), paid: money(agg._sum.paidAmount), balance: money(agg._sum.balanceAmount) },
      ...(withAging && { aging: Object.fromEntries(Object.entries(aging).map(([k, v]) => [k, v.toFixed(2)])) }),
      rows: data,
    };
  }

  private async payments(t: TenantContext, services: Id[], q: ReportQuery) {
    const where: Prisma.PaymentWhereInput = {
      companyId: t.companyId, serviceId: { in: services },
      ...((q.from || q.to) && { paidAt: { gte: q.from, lte: q.to } }),
      ...(q.customerId && { invoice: { customerId: q.customerId } }),
      ...(q.vendorId && { invoice: { vendorId: q.vendorId } }),
    };
    const [rows, byMethod] = await this.prisma.$transaction([
      this.prisma.payment.findMany({ where, orderBy: { paidAt: 'desc' }, take: 1000, include: { invoice: { select: { invoiceNumber: true, direction: true, customer: { select: { name: true } }, vendor: { select: { name: true } } } } } }),
      this.prisma.payment.groupBy({ by: ['method'], where: { ...where, status: 'SUCCESS' }, _sum: { amount: true }, _count: { _all: true }, orderBy: { method: 'asc' } }),
    ]);
    return {
      summary: byMethod.map((m) => ({ method: m.method, count: (m._count as { _all: number })._all, amount: money(m._sum?.amount) })),
      rows: rows.map((p) => ({ ...p, party: p.invoice.customer?.name ?? p.invoice.vendor?.name })),
    };
  }

  private tax(t: TenantContext, services: Id[], q: ReportQuery) {
    return this.prisma.$queryRaw<{ month: Date; direction: string; taxable: string; cgst: string; sgst: string; igst: string }[]>`
      SELECT date_trunc('month', i."issueDate")::date AS month, i.direction,
        SUM(ii."lineTotal" - ii."taxAmount")::text AS taxable, SUM(ii.cgst)::text AS cgst, SUM(ii.sgst)::text AS sgst, SUM(ii.igst)::text AS igst
      FROM invoice_items ii JOIN invoices i ON i.id = ii."invoiceId"
      WHERE i."companyId" = ${t.companyId}::bigint AND i."serviceId" = ANY(${services}::bigint[])
        AND i."invoiceType" <> 'PROFORMA' AND i.status NOT IN ('DRAFT','CANCELLED','VOID')
        AND (${q.from ?? null}::date IS NULL OR i."issueDate" >= ${q.from ?? null}::date)
        AND (${q.to ?? null}::date IS NULL OR i."issueDate" <= ${q.to ?? null}::date)
      GROUP BY 1, 2 ORDER BY 1 DESC, 2`;
  }

  private revenue(t: TenantContext, services: Id[], q: ReportQuery) {
    return this.prisma.$queryRaw<{ month: Date; invoiced: string; collected: string }[]>`
      WITH inv AS (
        SELECT date_trunc('month', "issueDate")::date AS month, SUM(total) AS invoiced FROM invoices
        WHERE "companyId" = ${t.companyId}::bigint AND "serviceId" = ANY(${services}::bigint[]) AND direction = 'RECEIVABLE'
          AND "invoiceType" NOT IN ('PROFORMA','CREDIT_NOTE') AND status NOT IN ('DRAFT','CANCELLED','VOID') GROUP BY 1),
      pay AS (
        SELECT date_trunc('month', p."paidAt" AT TIME ZONE 'Asia/Kolkata')::date AS month, SUM(p.amount) AS collected FROM payments p JOIN invoices i ON i.id = p."invoiceId"
        WHERE p."companyId" = ${t.companyId}::bigint AND p."serviceId" = ANY(${services}::bigint[]) AND p.status = 'SUCCESS' AND i.direction = 'RECEIVABLE' GROUP BY 1)
      SELECT COALESCE(inv.month, pay.month) AS month, COALESCE(inv.invoiced, 0)::text AS invoiced, COALESCE(pay.collected, 0)::text AS collected
      FROM inv FULL OUTER JOIN pay ON inv.month = pay.month
      WHERE (${q.from ?? null}::date IS NULL OR COALESCE(inv.month, pay.month) >= date_trunc('month', ${q.from ?? null}::date)::date)
        AND (${q.to ?? null}::date IS NULL OR COALESCE(inv.month, pay.month) <= ${q.to ?? null}::date)
      ORDER BY 1 DESC LIMIT 36`;
  }

  private async byService(t: TenantContext, services: Id[], q: ReportQuery) {
    const groups = await this.prisma.invoice.groupBy({
      by: ['serviceId', 'direction'], where: this.where(t, services, q), _sum: { total: true, paidAmount: true, balanceAmount: true }, _count: { _all: true }, orderBy: { serviceId: 'asc' },
    });
    const names = new Map((await this.prisma.service.findMany({ where: { id: { in: services } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
    return groups.map((g) => ({ serviceId: g.serviceId, service: names.get(g.serviceId), direction: g.direction, count: (g._count as { _all: number })._all, total: money(g._sum?.total), paid: money(g._sum?.paidAmount), balance: money(g._sum?.balanceAmount) }));
  }

  private async employees(t: TenantContext) {
    const groups = await this.prisma.employee.groupBy({ by: ['departmentId', 'status'], where: { companyId: t.companyId }, _count: { _all: true }, orderBy: { departmentId: 'asc' } });
    const depts = new Map((await this.prisma.department.findMany({ where: { companyId: t.companyId } })).map((d) => [d.id, d.name]));
    return groups.map((g) => ({ department: g.departmentId ? depts.get(g.departmentId) : 'Unassigned', status: g.status, count: (g._count as { _all: number })._all }));
  }
}
