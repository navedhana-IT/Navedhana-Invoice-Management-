import { BarChart3, Bell, Building2, CalendarClock, FileText, LayoutTemplate, ReceiptIndianRupee, ShieldCheck, Users } from 'lucide-react';

export const features = [
  { icon: Building2, title: 'One company, many brands', text: 'Run every service or brand with its own logo, GSTIN, bank account, invoice series and template.' },
  { icon: FileText, title: 'GST-ready invoicing', text: 'Tax, proforma, purchase, credit and debit notes with CGST/SGST/IGST computed on the server.' },
  { icon: CalendarClock, title: 'Flexible payment schedules', text: 'Split invoices into stages with fixed, optional or no due dates and record partial payments.' },
  { icon: LayoutTemplate, title: 'Template builder', text: 'Drag-and-drop invoice layouts, versioned and published per brand. Issued invoices never change.' },
  { icon: ReceiptIndianRupee, title: 'Receipts & vouchers', text: 'Every payment gets its own numbered receipt (sales) or voucher (purchases) as a PDF.' },
  { icon: BarChart3, title: 'Reports that add up', text: 'Receivables aging, payables, GST summaries, collections and revenue per brand.' },
  { icon: Users, title: 'Team & roles', text: 'Invite colleagues by email and give each person exactly the brands and permissions they need.' },
  { icon: Bell, title: 'Live notifications', text: 'Payments, overdue invoices and published templates appear instantly — in the app and by email.' },
  { icon: ShieldCheck, title: 'Built for audits', text: 'Strict tenant isolation, role-based permissions and an append-only audit trail.' },
];

export const faqs = [
  { q: 'Can one company really run several brands?', a: 'Yes. Each brand (we call them services) has its own name, logo, GSTIN, bank details, invoice numbering and default template, while customers, vendors and your team are shared at company level.' },
  { q: 'How does invoice numbering work?', a: 'Every brand has independent series for tax invoices, proformas, credit notes, debit notes, purchases, receipts and vouchers — for example LSP-INV-000001. Numbers are assigned atomically on issue, so there are never gaps or duplicates, even under load.' },
  { q: 'Is GST calculated for me?', a: 'Yes. Line totals, discounts and CGST/SGST or IGST are computed on the server from the place of supply. The same figures appear on screen, in the PDF and in reports.' },
  { q: 'What happens after my free trial?', a: 'Your data stays safe and fully readable. To keep creating and editing records, choose a plan — we will remind you by email a few days before the trial ends.' },
  { q: 'Can I change an invoice after issuing it?', a: 'Issued invoices are frozen for audit purposes: number, branding, template and amounts never change. Use a credit or debit note to adjust, or cancel/void it if it was raised in error.' },
  { q: 'How do I add my team?', a: 'Send an invitation from the Members page. Invites are single-use, expire automatically and can be revoked at any time. You choose each person’s role and which brands they can see.' },
  { q: 'Where is my data stored?', a: 'In PostgreSQL with strict per-company isolation, and documents in private object storage. Files are streamed through the API — storage links are never exposed.' },
  { q: 'Do you support recurring bookings or lead management?', a: 'Not today. nbills focuses on invoicing, payments and reporting, and does them thoroughly.' },
];

/** Static editorial content (no CMS yet). */
export const posts = [
  {
    slug: 'gst-invoicing-for-multi-brand-companies',
    title: 'GST invoicing when one company runs many brands',
    date: '2026-09-01',
    excerpt: 'Separate GSTINs, invoice series and bank accounts per brand — without separate software.',
    body: [
      'Many Indian businesses operate several brands under one legal entity or group. Each brand often needs its own invoice series, letterhead and sometimes its own GSTIN.',
      'A multi-brand ledger keeps a single customer and vendor master while letting every brand issue invoices with its own identity. Taxes are decided by the place of supply: CGST and SGST within a state, IGST across states.',
      'Once an invoice is issued its number, branding and template are frozen, so later design changes never alter a document you have already sent.',
    ],
  },
  {
    slug: 'staged-payments-without-spreadsheets',
    title: 'Staged payments without spreadsheets',
    date: '2026-09-15',
    excerpt: 'Advance, milestone and retention payments tracked against the invoice they belong to.',
    body: [
      'Project businesses rarely get paid in one go. An advance, a delivery milestone and a retention amount are common.',
      'Payment schedules let you split an invoice into stages. Each stage can have a fixed due date, an optional target date or no date at all, and only fixed dates can make a stage overdue.',
      'Payments are allocated to the oldest due stage first, and the invoice status is always derived from what has actually been received.',
    ],
  },
];
