import type { DueType, InvoiceDirection, InvoiceStatus, Prisma, StageStatus } from '@prisma/client';
import { D } from '../../common/money';

type Amount = Prisma.Decimal.Value;

export interface StageState {
  amount: Amount;
  paidAmount: Amount;
  dueType: DueType;
  dueDate: Date | null;
}

const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/**
 * Only FIXED due dates make a stage overdue; OPTIONAL dates are informational, NONE has no date.
 * `tracksDue` is false for proformas: they can't receive payments, so they never become overdue.
 */
export function stageStatus(s: StageState, today = new Date(), tracksDue = true): StageStatus {
  const paid = D(s.paidAmount);
  const amount = D(s.amount);
  if (paid.gte(amount)) return 'PAID';
  if (tracksDue && s.dueType === 'FIXED' && s.dueDate && startOfDay(s.dueDate) < startOfDay(today)) return 'OVERDUE';
  return paid.gt(0) ? 'PARTIALLY_PAID' : 'PENDING';
}

/**
 * Invoice status is always derived from payments; users cannot set PAID manually.
 * DRAFT / CANCELLED / VOID are explicit lifecycle states and are kept as-is.
 */
export function deriveInvoiceStatus(
  current: InvoiceStatus,
  direction: InvoiceDirection,
  total: Amount,
  stages: StageState[],
  today = new Date(),
  tracksDue = true,
): InvoiceStatus {
  if (current === 'DRAFT' || current === 'CANCELLED' || current === 'VOID') return current;
  const paid = stages.reduce((a, s) => a.plus(s.paidAmount), D(0));
  if (paid.gte(total)) return 'PAID';
  if (stages.some((s) => stageStatus(s, today, tracksDue) === 'OVERDUE')) return 'OVERDUE';
  if (paid.gt(0)) return 'PARTIALLY_PAID';
  return direction === 'PAYABLE' ? 'RECEIVED' : 'ISSUED';
}
