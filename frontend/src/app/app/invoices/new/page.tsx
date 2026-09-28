'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { InvoiceEditor } from '@/features/invoices/invoice-editor';

function New() {
  return <InvoiceEditor initialType={useSearchParams().get('type') ?? undefined} />;
}

export default function Page() {
  return <Suspense><New /></Suspense>;
}
