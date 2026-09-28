import { describe, expect, it } from 'vitest';
import { emptySignup, numberingFor, signupSchema, toSignupPayload, type SignupValues } from './schema';

const valid = (): SignupValues => {
  const v = emptySignup('7');
  v.account = { email: 'Owner@Acme.in ', password: 'Secret123', confirmPassword: 'Secret123' };
  v.company = { ...v.company, legalName: 'Acme Pvt Ltd', displayName: 'Acme', state: '' };
  v.admin = { fullName: 'Asha Rao', phone: '' };
  v.service = { ...v.service, name: 'Acme Solar', code: 'as' };
  v.invoicing = { ...v.invoicing, gstRegistered: true, gstin: '29abcde1234f1z5', state: 'Karnataka' };
  v.acceptTerms = true;
  return v;
};

const issues = (v: SignupValues) => {
  const r = signupSchema.safeParse(v);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]));
};

describe('signup schema', () => {
  it('accepts a complete signup', () => {
    expect(issues(valid())).toEqual({});
  });

  it('explains each invalid field', () => {
    const v = valid();
    v.account.password = 'short';
    v.account.confirmPassword = 'different';
    v.service.code = 'X';
    v.company.pincode = '1234';
    v.invoicing.gstin = '';
    v.acceptTerms = false;
    v.planId = '';
    expect(issues(v)).toMatchObject({
      'account.password': 'Use at least 8 characters with a letter and a number',
      'account.confirmPassword': 'Passwords don’t match',
      'service.code': 'Use 2–8 letters or digits',
      'company.pincode': 'PIN code has 6 digits',
      'invoicing.gstin': 'Enter the GSTIN for this brand',
      acceptTerms: 'Please accept the terms to continue',
      planId: 'Choose a plan',
    });
  });

  it('rejects a plan value that is not an id, such as a stale UUID', () => {
    const v = valid();
    v.planId = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
    expect(issues(v)).toEqual({ planId: 'Choose a plan' });
  });

  it('allows unregistered businesses without a GSTIN', () => {
    const v = valid();
    v.invoicing = { ...v.invoicing, gstRegistered: false, gstin: '' };
    expect(issues(v)).toEqual({});
  });

  it('builds numbering for every series from the chosen style', () => {
    const n = numberingFor('fy', 5, 101);
    expect(n.INVOICE).toEqual({ format: '{CODE}/INV/{FY}/{SEQ}', padding: 5, reset: 'FY', start: 101 });
    expect(n.RECEIPT).toEqual({ format: '{CODE}/RCT/{FY}/{SEQ}', padding: 5, reset: 'FY' });
    expect(new Set(Object.values(n).map((s) => s.format)).size).toBe(7);
  });

  it('shapes the API payload: normalised values, no empty strings', () => {
    const p = toSignupPayload(valid());
    expect(p.account).toEqual({ fullName: 'Asha Rao', email: 'owner@acme.in', password: 'Secret123' });
    expect(p.company).toMatchObject({ legalName: 'Acme Pvt Ltd', state: 'Karnataka', country: 'India' });
    expect(p.company).not.toHaveProperty('gstin');
    expect(p.service).toMatchObject({ name: 'Acme Solar', displayName: 'Acme Solar', code: 'AS', gstin: '29ABCDE1234F1Z5', state: 'Karnataka' });
    expect(p.service.numbering.INVOICE.format).toBe('{CODE}-INV-{SEQ}');
    expect(p.planId).toBe(7);
  });

  it('drops the GSTIN when the business is not GST registered', () => {
    const v = valid();
    v.invoicing.gstRegistered = false;
    expect(toSignupPayload(v).service).not.toHaveProperty('gstin');
  });
});
