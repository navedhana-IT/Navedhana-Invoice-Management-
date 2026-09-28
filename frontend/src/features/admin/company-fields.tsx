'use client';
import type { UseFormRegister } from 'react-hook-form';
import { Field, Input, Textarea } from '@/components/ui';

export type CompanyForm = {
  legalName: string; displayName: string; registrationNumber: string; gstin: string; pan: string; address: string; city: string;
  state: string; country: string; pincode: string; email: string; phone: string; website: string;
};

export const emptyCompany = (): CompanyForm => ({
  legalName: '', displayName: '', registrationNumber: '', gstin: '', pan: '', address: '', city: '', state: '', country: 'India', pincode: '', email: '', phone: '', website: '',
});

// Registered under a runtime `prefix` in different forms; RHF's typed register can't express that.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function CompanyFields({ register, prefix = '' }: { register: UseFormRegister<any>; prefix?: string }) {
  const r = (n: string, o?: object) => register(`${prefix}${n}`, o);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Legal name *"><Input {...r('legalName', { required: true })} /></Field>
      <Field label="Display name *"><Input {...r('displayName', { required: true })} /></Field>
      <Field label="Registration no. (CIN)"><Input {...r('registrationNumber')} /></Field>
      <Field label="GSTIN"><Input className="uppercase" {...r('gstin')} /></Field>
      <Field label="PAN"><Input className="uppercase" {...r('pan')} /></Field>
      <Field label="Email"><Input type="email" {...r('email')} /></Field>
      <Field label="Phone"><Input {...r('phone')} /></Field>
      <Field label="Website"><Input {...r('website')} /></Field>
      <Field label="Address" className="sm:col-span-2"><Textarea {...r('address')} /></Field>
      <Field label="City"><Input {...r('city')} /></Field>
      <Field label="State"><Input {...r('state')} /></Field>
      <Field label="Country"><Input {...r('country')} /></Field>
      <Field label="PIN code"><Input {...r('pincode')} /></Field>
    </div>
  );
}
