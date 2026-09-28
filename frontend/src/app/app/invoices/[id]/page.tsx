'use client';
import { use } from 'react';
import { notFound } from 'next/navigation';
import { toId } from '@/lib/ids';
import { InvoiceDetail } from '@/features/invoices/invoice-detail';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = toId(use(params).id);
  if (!id) notFound();
  return <InvoiceDetail id={id} />;
}
