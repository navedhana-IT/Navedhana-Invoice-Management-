'use client';
import { Badge } from '@/components/ui';
import { date, money } from '@/lib/utils';
import type { FieldDef, ResourceConfig } from './resource-page';
import type { Id } from '@/lib/ids';

// Rows come from generic CRUD endpoints with per-resource shapes; each config's columns define what it reads.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = { id: Id } & Record<string, any>;

const GSTIN: [RegExp, string] = [/^[0-9A-Za-z]{15}$/, 'GSTIN is 15 characters'];
const PAN: [RegExp, string] = [/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/, 'PAN looks like ABCDE1234F'];
const EMAIL: [RegExp, string] = [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address'];
const PHONE: [RegExp, string] = [/^[+\d][\d\s-]{6,19}$/, 'Enter a valid phone number'];
const statusOptions = [{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }];
const status: FieldDef = { name: 'status', label: 'Status', type: 'select', options: statusOptions };
const statusFilter = { name: 'status', label: 'Status', options: statusOptions };

const party: FieldDef[] = [
  { name: 'name', label: 'Name', required: true, full: true },
  { name: 'email', label: 'Email', type: 'email', pattern: EMAIL },
  { name: 'phone', label: 'Phone', type: 'tel', pattern: PHONE },
  { name: 'gstin', label: 'GSTIN', pattern: GSTIN, upper: true },
  { name: 'pan', label: 'PAN', pattern: PAN, upper: true },
  { name: 'state', label: 'State', hint: 'Decides CGST/SGST vs IGST' },
  status,
];

const partyCols = [
  { key: 'name', header: 'Name', sort: 'name', primary: true, cell: (r: R) => <span className="font-medium">{r.name}</span> },
  { key: 'contact', header: 'Contact', cell: (r: R) => <span className="text-fg-muted">{r.email ?? r.phone ?? '—'}</span> },
  { key: 'gstin', header: 'GSTIN', cell: (r: R) => r.gstin ?? '—' },
  { key: 'state', header: 'State', hideOnMobile: true, cell: (r: R) => r.state ?? '—' },
  { key: 'created', header: 'Added', sort: 'createdAt', hideOnMobile: true, cell: (r: R) => <span className="text-fg-muted">{date(r.createdAt)}</span> },
  { key: 'status', header: 'Status', cell: (r: R) => <Badge value={r.status} /> },
];

export const customers: ResourceConfig<R> = {
  path: 'customers', resource: 'customer', title: 'Customers', singular: 'customer', description: 'People and businesses you bill.',
  columns: partyCols, filters: [statusFilter], dateFilter: true, search: 'Search name, email, phone or GSTIN…',
  fields: [...party, { name: 'billingAddress', label: 'Billing address', type: 'textarea' }, { name: 'shippingAddress', label: 'Shipping address', type: 'textarea' }, { name: 'notes', label: 'Notes', type: 'textarea' }],
};

export const vendors: ResourceConfig<R> = {
  path: 'vendors', resource: 'vendor', title: 'Vendors', singular: 'vendor', description: 'Suppliers you receive bills from.',
  columns: partyCols, filters: [statusFilter], dateFilter: true, search: 'Search name, email, phone or GSTIN…',
  fields: [...party, { name: 'paymentTermsDays', label: 'Payment terms (days)', type: 'number', pattern: [/^\d{1,3}$/, 'Whole days, up to 999'] }, { name: 'address', label: 'Address', type: 'textarea' }, { name: 'notes', label: 'Notes', type: 'textarea' }],
};

export const products: ResourceConfig<R> = {
  path: 'products', resource: 'product', title: 'Products & services', singular: 'product', description: 'Reusable line items with default price and tax.',
  filters: [{ name: 'isActive', label: 'Availability', options: [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Archived' }] }],
  search: 'Search name, SKU or HSN/SAC…',
  columns: [
    { key: 'name', header: 'Name', sort: 'name', primary: true, cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'sku', header: 'SKU', cell: (r) => r.sku ?? '—' },
    { key: 'hsn', header: 'HSN/SAC', cell: (r) => r.hsnSac ?? '—' },
    { key: 'price', header: 'Price', sort: 'unitPrice', align: 'right', cell: (r) => money(r.unitPrice) },
    { key: 'tax', header: 'Tax', align: 'right', cell: (r) => `${Number(r.taxRate)}%` },
  ],
  fields: [
    { name: 'name', label: 'Name', required: true, full: true },
    { name: 'serviceId', label: 'Brand', type: 'service' },
    { name: 'sku', label: 'SKU' },
    { name: 'hsnSac', label: 'HSN/SAC', pattern: [/^\d{4,8}$/, 'HSN/SAC is 4–8 digits'] },
    { name: 'unit', label: 'Unit', hint: 'e.g. nos, hrs, kW' },
    { name: 'unitPrice', label: 'Unit price (₹)', type: 'decimal', required: true, pattern: [/^\d{1,16}(\.\d{1,2})?$/, 'Enter an amount with up to 2 decimals'] },
    { name: 'taxRate', label: 'GST rate (%)', type: 'select', options: ['0', '5', '12', '18', '28'].map((v) => ({ value: v, label: `${v}%` })) },
    { name: 'description', label: 'Description', type: 'textarea' },
  ],
};

export const departments: ResourceConfig<R> = {
  path: 'departments', resource: 'department', title: 'Departments', singular: 'department', description: 'Organize employees by team.',
  search: 'Search departments…',
  columns: [
    { key: 'name', header: 'Name', sort: 'name', primary: true, cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'desc', header: 'Description', cell: (r) => <span className="text-fg-muted">{r.description ?? '—'}</span> },
  ],
  fields: [{ name: 'name', label: 'Name', required: true }, { name: 'serviceId', label: 'Brand', type: 'service' }, { name: 'description', label: 'Description', type: 'textarea' }],
};

export const employees: ResourceConfig<R> = {
  path: 'employees', resource: 'employee', title: 'Employees', singular: 'employee', description: 'Staff records (separate from login users).',
  filters: [statusFilter], dateFilter: true, search: 'Search name, code, email or designation…',
  columns: [
    { key: 'name', header: 'Name', sort: 'fullName', primary: true, cell: (r) => <span className="font-medium">{r.fullName}</span> },
    { key: 'code', header: 'Code', cell: (r) => r.employeeCode ?? '—' },
    { key: 'designation', header: 'Designation', cell: (r) => r.designation ?? '—' },
    { key: 'joined', header: 'Joined', sort: 'joiningDate', cell: (r) => date(r.joiningDate) },
    { key: 'status', header: 'Status', cell: (r) => <Badge value={r.status} /> },
  ],
  fields: [
    { name: 'fullName', label: 'Full name', required: true, full: true },
    { name: 'employeeCode', label: 'Employee code' },
    { name: 'designation', label: 'Designation' },
    { name: 'email', label: 'Email', type: 'email', pattern: EMAIL },
    { name: 'phone', label: 'Phone', type: 'tel', pattern: PHONE },
    { name: 'serviceId', label: 'Brand', type: 'service' },
    { name: 'departmentId', label: 'Department', optionsFrom: { path: '/departments', label: 'name' } },
    { name: 'joiningDate', label: 'Joining date', type: 'date' },
    status,
  ],
};
