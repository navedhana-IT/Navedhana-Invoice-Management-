import { calculateInvoice } from './invoice-calculator';

describe('calculateInvoice', () => {
  it('computes intra-state GST split with decimals', () => {
    const r = calculateInvoice(
      [
        { quantity: '2', unitPrice: '1000.00', discount: '100', taxRate: '18' },
        { quantity: '1.5', unitPrice: '333.33', taxRate: '5' },
      ],
      'INTRA_STATE',
    );
    // line1: 2000 - 100 = 1900, tax 342 -> cgst 171 sgst 171
    expect(r.lines[0].taxAmount.toFixed(2)).toBe('342.00');
    expect(r.lines[0].cgst.toFixed(2)).toBe('171.00');
    expect(r.lines[0].sgst.toFixed(2)).toBe('171.00');
    // line2: 1.5 * 333.33 = 499.995 -> 500.00, tax 25.00
    expect(r.lines[1].lineTotal.toFixed(2)).toBe('525.00');
    expect(r.subtotal.toFixed(2)).toBe('2500.00');
    expect(r.discountTotal.toFixed(2)).toBe('100.00');
    expect(r.taxTotal.toFixed(2)).toBe('367.00');
    expect(r.total.toFixed(2)).toBe('2767.00');
  });

  it('uses IGST for inter-state and splits odd paise correctly for intra-state', () => {
    expect(calculateInvoice([{ quantity: 1, unitPrice: '100', taxRate: '18' }], 'INTER_STATE').lines[0].igst.toFixed(2)).toBe('18.00');
    const l = calculateInvoice([{ quantity: 1, unitPrice: '0.05', taxRate: '18' }], 'INTRA_STATE').lines[0];
    expect(l.cgst.plus(l.sgst).toFixed(2)).toBe(l.taxAmount.toFixed(2));
  });

  it('applies no tax when taxMode is NONE', () => {
    expect(calculateInvoice([{ quantity: 3, unitPrice: '10', taxRate: '18' }], 'NONE').total.toFixed(2)).toBe('30.00');
  });

  it('matches the 3,00,000 example exactly', () => {
    expect(calculateInvoice([{ quantity: 1, unitPrice: '300000' }], 'NONE').total.toFixed(2)).toBe('300000.00');
  });

  it.each([
    [{ quantity: 0, unitPrice: 1 }],
    [{ quantity: 1, unitPrice: -1 }],
    [{ quantity: 1, unitPrice: 10, discount: 11 }],
    [{ quantity: 1, unitPrice: 10, taxRate: 101 }],
  ])('rejects invalid line %j', (line) => {
    expect(() => calculateInvoice([line], 'INTRA_STATE')).toThrow();
  });

  it('rejects empty invoices', () => {
    expect(() => calculateInvoice([], 'NONE')).toThrow();
  });
});
