import { BadRequestException } from '@nestjs/common';
import type { TaxMode } from '@prisma/client';
import { D, Decimal, round2, sum } from '../../common/money';

export interface LineInput {
  quantity: string | number;
  unitPrice: string | number;
  discount?: string | number;
  taxRate?: string | number;
}

export interface LineResult {
  quantity: Decimal;
  unitPrice: Decimal;
  discount: Decimal;
  taxRate: Decimal;
  taxAmount: Decimal;
  cgst: Decimal;
  sgst: Decimal;
  igst: Decimal;
  lineTotal: Decimal;
}

export interface InvoiceTotals {
  lines: LineResult[];
  subtotal: Decimal;
  discountTotal: Decimal;
  taxTotal: Decimal;
  total: Decimal;
}

/**
 * Single source of truth for invoice math. Pure, decimal-only.
 * Per line: gross = qty * price; taxable = gross - discount; tax = taxable * rate%.
 * INTRA_STATE splits tax into CGST + SGST, INTER_STATE uses IGST, NONE applies no tax.
 */
export function calculateInvoice(lines: LineInput[], taxMode: TaxMode): InvoiceTotals {
  if (!lines.length) throw new BadRequestException('Invoice needs at least one item');

  const results = lines.map((l, i) => {
    const quantity = D(l.quantity);
    const unitPrice = D(l.unitPrice);
    const discount = round2(l.discount ?? 0);
    const taxRate = taxMode === 'NONE' ? D(0) : D(l.taxRate ?? 0);
    if (quantity.lte(0)) throw new BadRequestException(`Item ${i + 1}: quantity must be > 0`);
    if (unitPrice.lt(0)) throw new BadRequestException(`Item ${i + 1}: unit price must be >= 0`);
    if (taxRate.lt(0) || taxRate.gt(100)) throw new BadRequestException(`Item ${i + 1}: tax rate must be 0-100`);

    const gross = round2(quantity.times(unitPrice));
    if (discount.lt(0) || discount.gt(gross)) throw new BadRequestException(`Item ${i + 1}: discount must be between 0 and line amount`);
    const taxable = gross.minus(discount);
    const taxAmount = round2(taxable.times(taxRate).div(100));
    const cgst = taxMode === 'INTRA_STATE' ? round2(taxAmount.div(2)) : D(0);
    const sgst = taxMode === 'INTRA_STATE' ? taxAmount.minus(cgst) : D(0);
    const igst = taxMode === 'INTER_STATE' ? taxAmount : D(0);
    return { gross, result: { quantity, unitPrice, discount, taxRate, taxAmount, cgst, sgst, igst, lineTotal: taxable.plus(taxAmount) } };
  });

  const subtotal = sum(results.map((r) => r.gross));
  const discountTotal = sum(results.map((r) => r.result.discount));
  const taxTotal = sum(results.map((r) => r.result.taxAmount));
  return { lines: results.map((r) => r.result), subtotal, discountTotal, taxTotal, total: subtotal.minus(discountTotal).plus(taxTotal) };
}
