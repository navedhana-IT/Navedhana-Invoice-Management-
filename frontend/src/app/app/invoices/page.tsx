'use client';
import { InvoiceList } from '@/features/invoices/invoice-list';

export default function Page() {
  return <InvoiceList direction="RECEIVABLE" />;
}
