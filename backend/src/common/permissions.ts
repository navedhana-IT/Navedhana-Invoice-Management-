const catalog = {
  company: ['view', 'update'],
  service: ['create', 'view', 'update', 'delete'],
  user: ['create', 'view', 'update', 'delete'],
  role: ['create', 'view', 'update', 'delete'],
  department: ['create', 'view', 'update', 'delete'],
  employee: ['create', 'view', 'update', 'delete'],
  customer: ['create', 'view', 'update', 'delete'],
  vendor: ['create', 'view', 'update', 'delete'],
  product: ['create', 'view', 'update', 'delete'],
  invoice: ['create', 'view', 'update', 'delete', 'issue', 'cancel', 'send'],
  payment: ['create', 'view', 'update', 'refund'],
  template: ['view', 'manage', 'publish'],
  report: ['view'],
  audit: ['view'],
} as const;

type Catalog = typeof catalog;
export type Permission = { [K in keyof Catalog]: `${K}.${Catalog[K][number]}` }[keyof Catalog];

export const ALL_PERMISSIONS = Object.entries(catalog).flatMap(([resource, actions]) =>
  actions.map((a) => `${resource}.${a}`),
) as Permission[];

export const isPermission = (p: string): p is Permission => (ALL_PERMISSIONS as string[]).includes(p);

const pick = (...prefixes: string[]) =>
  ALL_PERMISSIONS.filter((p) => prefixes.some((x) => p === x || p.startsWith(`${x}.`)));

/** System roles seeded for every platform. Company custom roles are stored per company. */
export const SYSTEM_ROLES: { key: string; name: string; allServices: boolean; permissions: Permission[] }[] = [
  { key: 'company_admin', name: 'Company Admin', allServices: true, permissions: ALL_PERMISSIONS },
  {
    key: 'service_admin',
    name: 'Service Admin',
    allServices: false,
    permissions: [
      'service.view', 'service.update',
      ...pick('employee', 'customer', 'vendor', 'product', 'invoice', 'payment', 'template', 'report'),
    ],
  },
  {
    key: 'finance_manager',
    name: 'Finance Manager',
    allServices: false,
    permissions: ['service.view', 'customer.view', 'vendor.view', ...pick('invoice', 'payment', 'report')],
  },
  {
    key: 'employee',
    name: 'Employee',
    allServices: false,
    permissions: ['service.view', 'customer.view', 'customer.create', 'product.view', 'invoice.view', 'invoice.create'],
  },
];
