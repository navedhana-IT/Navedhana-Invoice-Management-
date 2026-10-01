'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { InvoiceEditor } from '@/features/invoices/invoice-editor';

function New() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const type = searchParams.get('type');

  useEffect(() => {
    if (type === 'PURCHASE') {
      router.replace('/app/purchases/new');
    }
  }, [type, router]);

  return <InvoiceEditor initialType={type ?? undefined} />;
}

export default function Page() {
  return <Suspense><New /></Suspense>;
}
