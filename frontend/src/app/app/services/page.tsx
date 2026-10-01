'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Globe, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { PageHeader } from '@/components/data';
import { Badge, Button, Card, Dialog, Empty, Skeleton } from '@/components/ui';
import { BrandFields, brandBody, emptyBrand, type BrandForm, type Service } from '@/features/services/brand-fields';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { formatNumber, resolveSeries } from '@/lib/numbering';
import { clean } from '@/lib/utils';

export default function ServicesPage() {
  const { can, companyId, ctx } = useSession();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['/services', companyId], queryFn: () => api<Service[]>('/services', { noService: true }) });

  return (
    <>
      <PageHeader
        title="Brands"
        description={`Each brand has its own identity, tax registration, numbering and templates${ctx?.company.plan ? ` · ${ctx.company.plan.name} plan` : ''}.`}
        actions={can('service.create') && <Button onClick={() => setOpen(true)}><Plus className="size-4" /> New brand</Button>}
      />
      {isLoading ? <div className="grid gap-4 md:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}</div> : !data?.length ? (
        <Card><Empty icon={<Building2 className="size-5" />} title="No brands yet" /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((s) => (
            <Link key={s.id} href={`/app/services/${s.id}`}>
              <Card className="h-full p-5 transition hover:border-primary hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-[#fd8904] to-[#fe5003] font-semibold text-white">{s.name[0]}</div>
                  <Badge value={s.status} />
                </div>
                <h2 className="mt-4 font-semibold">{s.displayName || s.name}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{s.description || 'No description'}</p>
                <div className="mt-4 flex items-center gap-4 text-xs text-fg-muted">
                  <span>Code <b className="text-fg">{s.code}</b></span>
                  <span className="truncate">Invoices <b className="text-fg">{formatNumber(resolveSeries(s.numbering, 'INVOICE'), s.code, resolveSeries(s.numbering, 'INVOICE').start)}</b></span>
                  {s.gstin && <span>GSTIN {s.gstin}</span>}
                  {s.isPublic && <span className="inline-flex items-center gap-1"><Globe className="size-3" /> Public</span>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="New brand" wide>{open && <CreateBrand onDone={() => setOpen(false)} />}</Dialog>
    </>
  );
}

function CreateBrand({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit } = useForm<BrandForm>({ defaultValues: emptyBrand() });
  const save = useMutation({
    mutationFn: (v: BrandForm) => api('/services', { body: clean(brandBody(v)) }),
    onSuccess: () => { toast.success('Brand created'); qc.invalidateQueries({ queryKey: ['/services'] }); qc.invalidateQueries({ queryKey: ['ctx'] }); onDone(); },
  });
  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-6">
      <BrandFields register={register} sections={['profile', 'tax', 'invoicing']} />
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onDone}>Cancel</Button><Button loading={save.isPending}>Create brand</Button></div>
    </form>
  );
}
