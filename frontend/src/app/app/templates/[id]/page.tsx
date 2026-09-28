'use client';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { use } from 'react';
import { notFound } from 'next/navigation';
import { toId } from '@/lib/ids';
import { Skeleton } from '@/components/ui';
import type { Template } from '@/features/templates/types';
import { api } from '@/lib/api';

const TemplateBuilder = dynamic(() => import('@/features/templates/builder').then((m) => m.TemplateBuilder), { ssr: false, loading: () => <Skeleton className="h-96" /> });

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = toId(use(params).id);
  if (!id) notFound();
  const { data } = useQuery({ queryKey: ['template', id], queryFn: () => api<Template>(`/invoice-templates/${id}`) });
  // Remount on version change so the builder starts from the latest saved config.
  return data ? <TemplateBuilder key={`${data.versions[0]?.id}-${data.versions[0]?.status}`} template={data} /> : <Skeleton className="h-96" />;
}
