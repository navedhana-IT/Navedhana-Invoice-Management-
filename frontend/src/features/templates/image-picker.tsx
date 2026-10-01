'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus } from 'lucide-react';
import { Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import type { Id } from '@/lib/ids';

type Asset = { id: Id; kind: string; storageKey: string; fileName: string };

/** Picks one of the brand's uploaded images (or uploads a new one) for an image block. */
export function ImagePicker({ serviceId, value, onChange }: { serviceId: Id; value: string; onChange: (key: string) => void }) {
  const qc = useQueryClient();
  const { can } = useSession();
  const assets = useQuery({ queryKey: ['/documents', serviceId], queryFn: () => api<Asset[]>('/documents', { query: { serviceId }, noService: true }) });
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('kind', 'OTHER');
      form.append('serviceId', String(serviceId));
      form.append('file', file);
      return api<Asset>('/documents/upload', { form, noService: true });
    },
    onSuccess: (doc) => { qc.invalidateQueries({ queryKey: ['/documents', serviceId] }); onChange(doc.storageKey); },
  });

  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">Image</legend>
      {assets.isLoading ? <Skeleton className="h-20" /> : (
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Choose image">
          {assets.data?.map((a) => (
            <button key={a.id} type="button" role="radio" aria-checked={value === a.storageKey} aria-label={a.fileName} title={a.fileName}
              onClick={() => onChange(a.storageKey)}
              className={cn('aspect-square overflow-hidden rounded-md border border-border-input bg-white p-1', value === a.storageKey ? 'border-primary ring-2 ring-primary/40' : 'hover:border-border-strong')}>
              <Thumb storageKey={a.storageKey} alt={a.fileName} />
            </button>
          ))}
          {can('service.update') && (
            <label className="grid aspect-square cursor-pointer place-items-center rounded-md border border-dashed border-border-input text-fg-muted hover:border-primary hover:text-primary">
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} />
              <span className="flex flex-col items-center gap-1 text-[11px]"><ImagePlus className="size-4" />{upload.isPending ? 'Uploading…' : 'Upload'}</span>
            </label>
          )}
        </div>
      )}
      <p className="mt-1.5 text-xs text-fg-muted">PNG, JPEG or WebP · max 5 MB</p>
    </fieldset>
  );
}

function Thumb({ storageKey, alt }: { storageKey: string; alt: string }) {
  const url = useQuery({ queryKey: ['sign', storageKey], queryFn: () => api<{ url: string }>('/documents/sign', { body: { key: storageKey }, noService: true }), staleTime: 240_000, retry: false });
  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
  return url.data ? <img src={url.data.url} alt={alt} className="size-full object-contain" /> : <Skeleton className="size-full" />;
}
