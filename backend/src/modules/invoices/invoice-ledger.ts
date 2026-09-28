import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { todayIn } from '../../common/dates';
import { D, sum } from '../../common/money';
import type { ScheduleItemDto } from './dto';
import { deriveInvoiceStatus, stageStatus } from './invoice-status';
import type { Id } from '../../common/ids';

type Tx = Prisma.TransactionClient;

/** Balance/status bookkeeping shared by invoices, payments and the overdue job. Always call inside a transaction. */
@Injectable()
export class InvoiceLedger {
  /** Row lock serialises concurrent payments/issue on the same invoice. */
  async lock(tx: Tx, invoiceId: Id) {
    await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${invoiceId}::bigint FOR UPDATE`;
  }

  validateSchedule(items: ScheduleItemDto[], total: Prisma.Decimal) {
    if (!items.length) return;
    for (const [i, s] of items.entries()) {
      if (D(s.amount).lte(0)) throw new BadRequestException(`Stage ${i + 1}: amount must be > 0`);
      if (s.dueType === 'FIXED' && !s.dueDate) throw new BadRequestException(`Stage ${i + 1}: FIXED stages need a due date`);
      if (s.dueType === 'NONE' && s.dueDate) throw new BadRequestException(`Stage ${i + 1}: NONE stages cannot have a due date`);
    }
    const stagesTotal = sum(items.map((s) => s.amount));
    if (!stagesTotal.equals(total)) {
      throw new BadRequestException(`Payment stages total ${stagesTotal.toFixed(2)} must equal invoice total ${total.toFixed(2)}`);
    }
  }

  scheduleRows(companyId: Id, items: ScheduleItemDto[]) {
    return items.map((s, i) => ({
      companyId, stageNumber: i + 1, description: s.description, amount: D(s.amount).toDecimalPlaces(2),
      dueType: s.dueType, dueDate: s.dueDate ?? null,
    }));
  }

  /** Recomputes stage statuses, paid/balance and invoice status from stage paid amounts. */
  async recompute(tx: Tx, invoiceId: Id, now = new Date()) {
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { schedule: true, company: { select: { timezone: true } } } });
    const today = todayIn(inv.company.timezone, now);
    const tracksDue = inv.invoiceType !== 'PROFORMA';
    for (const s of inv.schedule) {
      const status = stageStatus(s, today, tracksDue);
      if (status !== s.status) await tx.paymentScheduleItem.update({ where: { id: s.id }, data: { status } });
    }
    const paid = sum(inv.schedule.map((s) => s.paidAmount));
    const status = deriveInvoiceStatus(inv.status, inv.direction, inv.total, inv.schedule, today, tracksDue);
    return tx.invoice.update({
      where: { id: invoiceId },
      data: { paidAmount: paid, balanceAmount: D(inv.total).minus(paid), status },
    });
  }
}
