/** Shared plan-limit presentation for pricing, signup and admin screens. `null` limits mean unlimited. */
export const LIMIT_LABELS: [key: string, singular: string, plural: string][] = [
  ['maxServices', 'brand', 'brands'],
  ['maxUsers', 'team member', 'team members'],
  ['maxInvoicesPerMonth', 'invoice / month', 'invoices / month'],
  ['maxCustomers', 'customer', 'customers'],
  ['maxVendors', 'vendor', 'vendors'],
  ['maxEmployees', 'employee', 'employees'],
];

export const FEATURE_FLAGS: [key: string, label: string][] = [
  ['customTemplates', 'Custom invoice templates'],
  ['reports', 'Reports & CSV export'],
  ['apiAccess', 'API access'],
];

/** Plan features are free text; legacy snake_case codes are shown as readable labels. */
export function featureLabel(f: string) {
  return /^[a-z0-9_]+$/.test(f) ? f.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : f;
}

export function limitText(limits: Record<string, unknown>, key: string, singular: string, plural: string) {
  const v = limits[key];
  if (v === null || v === undefined) return `Unlimited ${plural}`;
  const n = Number(v);
  return `${n.toLocaleString('en-IN')} ${n === 1 ? singular : plural}`;
}

export function storageText(limits: Record<string, unknown>) {
  const mb = limits.storageMb;
  if (mb === null || mb === undefined) return 'Unlimited storage';
  const n = Number(mb);
  return n >= 1024 ? `${(n / 1024).toLocaleString('en-IN', { maximumFractionDigits: 1 })} GB storage` : `${n} MB storage`;
}

export function priceText(price: string, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: Number(price) % 1 ? 2 : 0 }).format(Number(price));
}
