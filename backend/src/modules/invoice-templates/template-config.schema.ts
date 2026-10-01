import type { Prisma } from '@prisma/client';
import { z } from 'zod';

export const SECTION_TYPES = [
  'logo', 'company_header', 'invoice_details', 'customer_details', 'items_table', 'tax_table', 'totals',
  'payment_schedule', 'payments', 'bank_details', 'terms', 'signature', 'custom_text', 'custom_image', 'custom_field',
  'qr_code', 'footer',
] as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const align = z.enum(['left', 'center', 'right']);
/** Pixel sizes; defaults keep templates saved before these options rendering as they did. */
const px = (min: number, max: number, fallback: number) => z.number().int().min(min).max(max).default(fallback);

export const templateConfigSchema = z.object({
  version: z.literal(1),
  page: z.object({ size: z.enum(['A4', 'LETTER']), orientation: z.enum(['portrait', 'landscape']) }),
  theme: z.object({
    fontFamily: z.string().max(80),
    baseFontSize: z.number().min(8).max(16),
    primaryColor: hex,
    accentColor: hex,
  }),
  header: z.object({
    logo: z.enum(['service_logo', 'header_logo', 'none']),
    showCompanyName: z.boolean(),
    showContact: z.boolean(),
    logoPosition: align.default('left'),
    logoSize: px(24, 160, 60),
    nameAlign: align.default('left'),
    nameSize: px(12, 40, 20),
    contactAlign: align.default('right'),
    contactSize: px(7, 16, 9),
    divider: z.boolean().default(true),
  }),
  sections: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        type: z.enum(SECTION_TYPES),
        width: z.enum(['full', 'half']).default('full'),
        props: z.record(z.unknown()).default({}),
      }),
    )
    .max(40),
  footer: z.object({
    showTerms: z.boolean(),
    logo: z.enum(['footer_logo', 'none']),
    text: z.string().max(500).optional(),
    logoPosition: align.default('right'),
    logoSize: px(16, 120, 40),
    textAlign: align.default('left'),
    textSize: px(7, 14, 9),
    showContact: z.boolean().default(false),
    contactAlign: align.default('center'),
    contactSize: px(7, 14, 8),
    /** Keeps the footer at the bottom of the last page instead of right after the content. */
    pinToBottom: z.boolean().default(true),
  }),
});

export type TemplateConfig = z.infer<typeof templateConfigSchema>;

export const defaultTemplateConfig = (): TemplateConfig => templateConfigSchema.parse({
  version: 1,
  page: { size: 'A4', orientation: 'portrait' },
  theme: { fontFamily: 'Inter, Arial, sans-serif', baseFontSize: 11, primaryColor: '#0f172a', accentColor: '#2563eb' },
  header: { logo: 'service_logo', showCompanyName: true, showContact: true },
  sections: [
    { id: 's1', type: 'invoice_details', width: 'half', props: {} },
    { id: 's2', type: 'customer_details', width: 'half', props: {} },
    { id: 's3', type: 'items_table', width: 'full', props: {} },
    { id: 's4', type: 'totals', width: 'full', props: {} },
    { id: 's5', type: 'payment_schedule', width: 'full', props: {} },
    { id: 's6', type: 'bank_details', width: 'half', props: {} },
    { id: 's7', type: 'signature', width: 'half', props: {} },
  ],
  footer: { showTerms: true, logo: 'footer_logo' },
});

export const asJson = (c: TemplateConfig) => c as unknown as Prisma.InputJsonObject;

/** Uploaded images referenced by blocks: custom images and uploaded payment QR codes. */
export const sectionImageKeys = (c: TemplateConfig) =>
  [...new Set(c.sections.filter((s) => s.type === 'custom_image' || s.type === 'qr_code').map((s) => String(s.props.imageKey ?? '')).filter(Boolean))];
