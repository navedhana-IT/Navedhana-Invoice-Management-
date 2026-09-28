import type { Id } from '@/lib/ids';
export type Direction = 'RECEIVABLE' | 'PAYABLE';
export const SALES_TYPES = ['TAX', 'SALES', 'PROFORMA', 'CREDIT_NOTE', 'DEBIT_NOTE'] as const;
export const STATUSES = ['DRAFT', 'ISSUED', 'RECEIVED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'VOID'] as const;
export const METHODS = ['BANK_TRANSFER', 'UPI', 'CASH', 'CARD', 'CHEQUE', 'OTHER'] as const;

export type InvoiceRow = {
  id: Id; invoiceNumber: string | null; invoiceType: string; direction: Direction; status: string; issueDate: string | null;
  total: string; balanceAmount: string; customer?: { name: string } | null; vendor?: { name: string } | null; service: { name: string };
};

export type Stage = { id: Id; stageNumber: number; description: string | null; amount: string; paidAmount: string; dueType: 'FIXED' | 'OPTIONAL' | 'NONE'; dueDate: string | null; status: string };
export type Payment = { id: Id; receiptNumber: string | null; amount: string; method: string; status: string; paidAt: string; reference: string | null; notes: string | null; reversalOfId: Id | null };

export type Invoice = Omit<InvoiceRow, 'customer'> & {
  customer?: { name: string; email: string | null; state: string | null } | null;
  serviceId: Id; customerId: Id | null; vendorId: Id | null; externalNumber: string | null; dueDate: string | null;
  taxMode: string; subtotal: string; discountTotal: string; taxTotal: string; paidAmount: string;
  notes: string | null; terms: string | null; customFieldValues: Record<string, unknown> | null; pdfDocumentId: Id | null;
  referenceInvoice: { id: Id; invoiceNumber: string } | null;
  items: { id: Id; productId: Id | null; description: string; hsnSac: string | null; quantity: string; unitPrice: string; discount: string; taxRate: string; taxAmount: string; cgst: string; sgst: string; igst: string; lineTotal: string }[];
  schedule: Stage[]; payments: Payment[];
};

export const partyName = (r: InvoiceRow) => r.customer?.name ?? r.vendor?.name ?? '—';
