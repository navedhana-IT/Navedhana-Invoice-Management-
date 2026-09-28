'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Alert, Button, Card, describeError, Field, Input, Select } from '@/components/ui';
import { api } from '@/lib/api';
import {
  DEFAULT_FORMAT, formatError, formatNumber, RESET_LABELS, resolveSeries, SERIES, SERIES_LABELS, TOKENS,
  type Reset, type Series, type SeriesConfig,
} from '@/lib/numbering';
import type { Service } from './brand-fields';

type Draft = Record<Series, { format: string; padding: string; start: string; reset: Reset }>;

const toDraft = (s: Service): Draft =>
  Object.fromEntries(SERIES.map((k) => {
    const c = resolveSeries(s.numbering, k);
    return [k, { format: c.format, padding: String(c.padding), start: String(c.start), reset: c.reset }];
  })) as Draft;

const toConfig = (d: Draft): Record<Series, SeriesConfig> =>
  Object.fromEntries(SERIES.map((k) => [k, { format: d[k].format.trim(), padding: Number(d[k].padding), start: Number(d[k].start), reset: d[k].reset }])) as Record<Series, SeriesConfig>;

function errorsFor(d: Draft): Partial<Record<Series, string>> {
  const out: Partial<Record<Series, string>> = {};
  const seen = new Map<string, Series>();
  for (const k of SERIES) {
    const c = d[k];
    const p = Number(c.padding);
    const st = Number(c.start);
    out[k] = formatError(c.format)
      ?? (!Number.isInteger(p) || p < 1 || p > 10 ? 'Padding must be 1–10 digits' : null)
      ?? (!Number.isInteger(st) || st < 1 ? 'Start number must be 1 or more' : null)
      ?? (seen.has(c.format.trim()) ? `Same format as ${SERIES_LABELS[seen.get(c.format.trim())!]}` : null)
      ?? undefined;
    seen.set(c.format.trim(), k);
  }
  return out;
}

function useDebounced<T>(value: T, ms = 400) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function NumberingSettings({ service, canEdit }: { service: Service; canEdit: boolean }) {
  const qc = useQueryClient();
  const initial = useMemo(() => toDraft(service), [service]);
  const [draft, setDraft] = useState(initial);
  const errors = errorsFor(draft);
  const valid = SERIES.every((k) => !errors[k]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const debounced = useDebounced(draft);

  const preview = useQuery({
    queryKey: ['numbering-preview', service.id, debounced],
    queryFn: () => api<Record<Series, string>>(`/services/${service.id}/numbering/preview`, { body: { numbering: toConfig(debounced) }, noService: true }),
    enabled: SERIES.every((k) => !errorsFor(debounced)[k]),
    retry: false,
  });

  const save = useMutation({
    mutationFn: () => api(`/services/${service.id}`, { method: 'PATCH', body: { numbering: toConfig(draft) }, noService: true }),
    onSuccess: () => { toast.success('Numbering saved'); qc.invalidateQueries({ queryKey: ['service', service.id] }); qc.invalidateQueries({ queryKey: ['/services'] }); },
  });

  const set = (k: Series, patch: Partial<Draft[Series]>) => setDraft((d) => ({ ...d, [k]: { ...d[k], ...patch } }));

  return (
    <div className="grid gap-4">
      <Alert tone="info" title="How numbering works">
        Numbers are assigned when a document is issued, never for drafts. Every format needs <code>{'{CODE}'}</code> (your brand code, <b>{service.code}</b>) and <code>{'{SEQ}'}</code>.
        Changing a format only affects documents issued afterwards.
      </Alert>
      {preview.error && <Alert tone="danger">{describeError(preview.error).description}</Alert>}
      <div className="grid gap-4 xl:grid-cols-2">
        {SERIES.map((k) => {
          const c = draft[k];
          const local = errors[k] ? null : formatNumber({ format: c.format, padding: Number(c.padding) }, service.code, Number(c.start));
          return (
            <Card key={k} className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="font-semibold">{SERIES_LABELS[k]}</h3>
                {canEdit && c.format !== DEFAULT_FORMAT[k] && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => set(k, { format: DEFAULT_FORMAT[k] })}><RotateCcw className="size-3.5" /> Default</Button>
                )}
              </div>
              <Field label="Format" error={errors[k]}>
                <Input value={c.format} disabled={!canEdit} onChange={(e) => set(k, { format: e.target.value })} className="font-mono" aria-label={`${SERIES_LABELS[k]} format`} />
              </Field>
              {canEdit && (
                <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Insert token">
                  {TOKENS.map(([t, meaning]) => (
                    <button key={t} type="button" title={meaning} onClick={() => set(k, { format: c.format + t })}
                      className="cursor-pointer rounded-md border bg-muted/50 px-2 py-0.5 font-mono text-xs hover:border-primary hover:text-primary">{t}</button>
                  ))}
                </div>
              )}
              <div className="mt-3 grid grid-cols-3 gap-3">
                <Field label="Digits"><Input inputMode="numeric" value={c.padding} disabled={!canEdit} onChange={(e) => set(k, { padding: e.target.value })} /></Field>
                <Field label="Start at"><Input inputMode="numeric" value={c.start} disabled={!canEdit} onChange={(e) => set(k, { start: e.target.value })} /></Field>
                <Field label="Restart">
                  <Select value={c.reset} disabled={!canEdit} onChange={(e) => set(k, { reset: e.target.value as Reset })}>
                    {Object.entries(RESET_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </Select>
                </Field>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-3 text-sm">
                <div><dt className="text-xs text-fg-muted">Format example</dt><dd className="truncate font-mono">{local ?? '—'}</dd></div>
                <div><dt className="text-xs text-fg-muted">Next to be issued</dt><dd className="truncate font-mono font-medium">{preview.data?.[k] ?? '—'}</dd></div>
              </dl>
            </Card>
          );
        })}
      </div>
      {canEdit && (
        <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 border-t bg-bg/90 px-1 py-3 backdrop-blur">
          <Button type="button" variant="secondary" disabled={!dirty} onClick={() => setDraft(initial)}>Discard</Button>
          <Button type="button" loading={save.isPending} disabled={!dirty || !valid} onClick={() => save.mutate()}>Save numbering</Button>
        </div>
      )}
    </div>
  );
}
