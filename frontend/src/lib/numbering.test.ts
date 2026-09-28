import { describe, expect, it } from 'vitest';
import { codeFromName, formatError, formatNumber, resolveSeries } from './numbering';

describe('numbering', () => {
  const march = new Date(2027, 2, 15);
  const april = new Date(2026, 3, 1);

  it('formats every token', () => {
    expect(formatNumber({ format: '{CODE}-INV-{SEQ}', padding: 6 }, 'LSP', 1, april)).toBe('LSP-INV-000001');
    expect(formatNumber({ format: '{CODE}/{YYYY}/{MM}/{SEQ}', padding: 4 }, 'NSS', 42, april)).toBe('NSS/2026/04/0042');
    expect(formatNumber({ format: '{CODE}{YY}-{SEQ}', padding: 3 }, 'AB', 7, april)).toBe('AB26-007');
  });

  it('uses the April–March financial year', () => {
    expect(formatNumber({ format: '{FY}', padding: 1 }, 'X', 1, march)).toBe('2026-27');
    expect(formatNumber({ format: '{FY}', padding: 1 }, 'X', 1, april)).toBe('2026-27');
    expect(formatNumber({ format: '{FY}', padding: 1 }, 'X', 1, new Date(2026, 2, 31))).toBe('2025-26');
  });

  it('clamps padding and never truncates long sequences', () => {
    expect(formatNumber({ format: '{SEQ}', padding: 0 }, 'X', 5)).toBe('5');
    expect(formatNumber({ format: '{SEQ}', padding: 40 }, 'X', 5)).toBe('0000000005');
    expect(formatNumber({ format: '{SEQ}', padding: 3 }, 'X', 123456)).toBe('123456');
  });

  it('validates formats like the server', () => {
    expect(formatError('{CODE}-INV-{SEQ}')).toBeNull();
    expect(formatError('')).toBe('Enter a format');
    expect(formatError('{CODE}-INV')).toBe('Include both {CODE} and {SEQ}');
    expect(formatError('INV-{SEQ}')).toBe('Include both {CODE} and {SEQ}');
    expect(formatError('{CODE}-{DAY}-{SEQ}')).toBe('Unknown token');
    expect(formatError('{CODE}#{SEQ}')).toMatch(/letters, digits/);
    expect(formatError(`{CODE}${'A'.repeat(40)}{SEQ}`)).toMatch(/under 40/);
  });

  it('merges stored overrides onto defaults', () => {
    expect(resolveSeries(null, 'RECEIPT')).toEqual({ format: '{CODE}-RCT-{SEQ}', padding: 6, start: 1, reset: 'NEVER' });
    expect(resolveSeries({ RECEIPT: { padding: 4 } }, 'RECEIPT')).toMatchObject({ format: '{CODE}-RCT-{SEQ}', padding: 4 });
  });

  it('suggests a brand code from the name', () => {
    expect(codeFromName('Lotus Solar Power')).toBe('LSP');
    expect(codeFromName('acme')).toBe('ACME');
    expect(codeFromName('A')).toBe('AX');
    expect(codeFromName('')).toBe('');
  });
});
