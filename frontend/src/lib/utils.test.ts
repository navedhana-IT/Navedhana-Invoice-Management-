import { describe, expect, it } from 'vitest';
import { clean } from './utils';

describe('clean', () => {
  it('drops blanks and trims strings on create', () => {
    expect(clean({ name: '  Acme ', gstin: '', phone: undefined, credit: 0 })).toEqual({ name: 'Acme', credit: 0 });
  });

  it('sends null for blanks on update so fields can be cleared', () => {
    expect(clean({ name: 'Acme', gstin: '' }, true)).toEqual({ name: 'Acme', gstin: null });
  });

  it('cleans nested objects and drops empty ones', () => {
    expect(clean({ address: { city: ' Pune ', line2: '' }, meta: { a: '' } })).toEqual({ address: { city: 'Pune' } });
  });

  it('keeps arrays as-is', () => {
    expect(clean({ tags: ['a', ''] })).toEqual({ tags: ['a', ''] });
  });
});
