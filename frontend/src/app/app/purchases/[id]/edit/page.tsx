'use client';
import { useQuery } from '@tanstack/react-query';
import { use } from 'react';
import { notFound } from 'next/navigation';
import { toId } from '@/lib/ids';
import { Skeleton } from '@/components/ui';
import { InvoiceEditor } from '@/features/invoices/invoice-editor';
import type { Invoice } from '@/features/invoices/types';
import { api } from '@/lib/api';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = toId(use(params).id);
  if (!id) notFound();
  const { data } = useQuery({ queryKey: ['invoice', id], queryFn: () => api<Invoice>(`/invoices/${id}`) });
  return data ? <InvoiceEditor invoice={data} /> : <Skeleton className="h-96" />;
}
