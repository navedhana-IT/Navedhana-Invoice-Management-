import type { Id } from '@/lib/ids';
/** Mirrors backend `templateConfigSchema` (the server validates every save with Zod). */
export const SECTION_TYPES = [
  'logo', 'company_header', 'invoice_details', 'customer_details', 'items_table', 'tax_table', 'totals',
  'payment_schedule', 'payments', 'bank_details', 'terms', 'signature', 'custom_text', 'custom_image', 'qr_code', 'footer',
] as const;
export type SectionType = (typeof SECTION_TYPES)[number] | 'custom_field';

export type Section = { id: string; type: SectionType; width: 'full' | 'half'; props: Record<string, unknown> };

export type Align = 'left' | 'center' | 'right';

export type TemplateConfig = {
  version: 1;
  page: { size: 'A4' | 'LETTER'; orientation: 'portrait' | 'landscape' };
  theme: { fontFamily: string; baseFontSize: number; primaryColor: string; accentColor: string };
  header: {
    logo: 'service_logo' | 'header_logo' | 'none'; showCompanyName: boolean; showContact: boolean;
    logoPosition: Align; logoSize: number; nameAlign: Align; nameSize: number; contactAlign: Align; contactSize: number; divider: boolean;
  };
  sections: Section[];
  footer: { showTerms: boolean; logo: 'footer_logo' | 'none'; text?: string; logoPosition: Align; logoSize: number; textAlign: Align; textSize: number; showContact: boolean; contactAlign: Align; contactSize: number; pinToBottom: boolean };
};

/** Server defaults for header/footer layout; versions saved before these options exist may omit them. */
export const HEADER_DEFAULTS = { logoPosition: 'left', logoSize: 60, nameAlign: 'left', nameSize: 20, contactAlign: 'right', contactSize: 9, divider: true } as const;
export const FOOTER_DEFAULTS = { logoPosition: 'right', logoSize: 40, textAlign: 'left', textSize: 9, showContact: false, contactAlign: 'center', contactSize: 8, pinToBottom: true } as const;

export const withLayoutDefaults = (c: TemplateConfig): TemplateConfig => ({
  ...c,
  header: { ...HEADER_DEFAULTS, ...c.header },
  footer: { ...FOOTER_DEFAULTS, ...c.footer },
});

export type TemplateVersion = { id: Id; version: number; status: 'DRAFT' | 'PUBLISHED'; publishedAt: string | null; createdAt: string; config: TemplateConfig };

export type Template = {
  id: Id; name: string; serviceId: Id;
  service: { name: string; defaultTemplateId: Id | null };
  versions: TemplateVersion[];
};

export const SECTION_LABELS: Record<SectionType, string> = {
  logo: 'Logo', company_header: 'Company header', invoice_details: 'Invoice details', customer_details: 'Bill to',
  items_table: 'Items table', tax_table: 'Tax breakup', totals: 'Totals', payment_schedule: 'Payment schedule',
  payments: 'Payments', bank_details: 'Bank details', terms: 'Terms', signature: 'Signature',
  custom_text: 'Text block', custom_image: 'Image', custom_field: 'Custom field',
  qr_code: 'Payment QR code', footer: 'Footer text',
};
