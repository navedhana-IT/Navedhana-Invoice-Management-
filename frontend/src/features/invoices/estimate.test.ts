import { describe, expect, it } from 'vitest';
import { autoTaxMode, estimate, estimateLine } from './estimate';

describe('estimateLine', () => {
  it('calculates single line subtotal and tax with discount', () => {
    expect(estimateLine({ quantity: '2', unitPrice: '100', discount: '10', taxRate: '18' })).toEqual({
      subtotal: 190,
      tax: 34.2,
      total: 224.2,
    });
  });

  it('handles empty line or taxMode NONE', () => {
    expect(estimateLine(undefined)).toEqual({ subtotal: 0, tax: 0, total: 0 });
    expect(estimateLine({ quantity: '1', unitPrice: '100', taxRate: '18' }, 'NONE')).toEqual({
      subtotal: 100,
      tax: 0,
      total: 100,
    });
  });
});

describe('estimate', () => {
  it('applies discount before tax and rounds tax per line', () => {
    expect(estimate([
      { quantity: '2', unitPrice: '100', discount: '10', taxRate: '18' },
      { quantity: '1', unitPrice: '0.05', taxRate: '18' },
    ])).toMatchObject({ subtotal: 190.05, tax: 34.21, total: 224.26 });
  });

  it('treats blank fields as zero', () => {
    expect(estimate([{ quantity: '', unitPrice: '' }, {}])).toMatchObject({ subtotal: 0, tax: 0, total: 0 });
  });

  it('avoids floating point drift', () => {
    expect(estimate([{ quantity: '3', unitPrice: '0.1' }]).total).toBe(0.3);
  });

  it('splits intra-state tax into CGST and SGST, rounding CGST half-up like the server', () => {
    const e = estimate([{ quantity: '1', unitPrice: '0.05', taxRate: '18' }]);
    expect(e).toMatchObject({ cgst: 0.01, sgst: 0, igst: 0 });
    expect(estimate([{ quantity: '1', unitPrice: '100', taxRate: '18' }])).toMatchObject({ cgst: 9, sgst: 9, igst: 0, total: 118 });
  });

  it('uses IGST for inter-state supply', () => {
    expect(estimate([{ quantity: '1', unitPrice: '100', taxRate: '18' }], 'INTER_STATE')).toMatchObject({ cgst: 0, sgst: 0, igst: 18, total: 118 });
  });

  it('applies no tax when the mode is NONE', () => {
    expect(estimate([{ quantity: '1', unitPrice: '100', taxRate: '18' }], 'NONE')).toMatchObject({ tax: 0, total: 100 });
  });
});

describe('autoTaxMode', () => {
  it('compares states case-insensitively and defaults to intra-state when unknown', () => {
    expect(autoTaxMode('Karnataka', ' karnataka ')).toBe('INTRA_STATE');
    expect(autoTaxMode('Karnataka', 'Kerala')).toBe('INTER_STATE');
    expect(autoTaxMode(null, 'Kerala')).toBe('INTRA_STATE');
  });
});
