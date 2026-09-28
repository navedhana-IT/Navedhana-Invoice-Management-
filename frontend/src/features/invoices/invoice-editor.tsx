'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { PageHeader } from '@/components/data';
import { Button, Card, CardHeader, Combobox, Field, Input, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { toId, type Id } from '@/lib/ids';
import { useSession } from '@/lib/session';
import { money, titleCase, today } from '@/lib/utils';
import { autoTaxMode, estimate, type TaxMode } from './estimate';
import { partyName, SALES_TYPES, type Invoice, type InvoiceRow } from './types';

type Item = { productId: Id | ''; description: string; hsnSac: string; quantity: string; unitPrice: string; discount: string; taxRate: string };
type Form = {
  serviceId: Id | ''; invoiceType: string; partyId: Id | ''; referenceInvoiceId: Id | ''; externalNumber: string;
  issueDate: string; dueDate: string; taxMode: string; notes: string; terms: string; custom: Record<string, string | boolean>; items: Item[];
};
type Product = { id: Id; name: string; hsnSac: string | null; unitPrice: string; taxRate: string; description: string | null };
type Party = { id: Id; name: string; state: string | null; gstin: string | null };

const TAX_LABEL: Record<TaxMode, string> = { INTRA_STATE: 'CGST + SGST', INTER_STATE: 'IGST', NONE: 'no GST' };
const positive = (v: string) => Number(v) > 0 || 'Must be more than 0';
type CustomField = { id: Id; key: string; label: string; type: string; options: string[]; required: boolean; serviceId: Id };

const blankItem: Item = { productId: '', description: '', hsnSac: '', quantity: '1', unitPrice: '', discount: '', taxRate: '18' };
const DEC = /^\d+(\.\d{1,4})?$/;

export function InvoiceEditor({ invoice, initialType }: { invoice?: Invoice; initialType?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { ctx, serviceId } = useSession();
  const type = invoice?.invoiceType ?? initialType ?? 'TAX';
  const purchase = type === 'PURCHASE';

  const { register, control, handleSubmit, setValue, formState: { errors } } = useForm<Form>({
    defaultValues: invoice
      ? {
          serviceId: invoice.serviceId, invoiceType: invoice.invoiceType, partyId: invoice.customerId ?? invoice.vendorId ?? '', referenceInvoiceId: invoice.referenceInvoice?.id ?? '',
          externalNumber: invoice.externalNumber ?? '', issueDate: invoice.issueDate?.slice(0, 10) ?? '', dueDate: invoice.dueDate?.slice(0, 10) ?? '',
          taxMode: invoice.taxMode, notes: invoice.notes ?? '', terms: invoice.terms ?? '', custom: (invoice.customFieldValues ?? {}) as Form['custom'],
          items: invoice.items.map((i) => ({ productId: i.productId ?? '', description: i.description, hsnSac: i.hsnSac ?? '', quantity: String(Number(i.quantity)), unitPrice: i.unitPrice, discount: Number(i.discount) ? i.discount : '', taxRate: String(Number(i.taxRate)) })),
        }
      : { serviceId: serviceId ?? ctx?.services[0]?.id ?? '', invoiceType: type, partyId: '', referenceInvoiceId: '', externalNumber: '', issueDate: today(), dueDate: '', taxMode: '', notes: '', terms: '', custom: {}, items: [blankItem] },
  });
  const items = useFieldArray({ control, name: 'items' });
  const [watchedItems, svc, invType, partyId, chosenMode] = useWatch({ control, name: ['items', 'serviceId', 'invoiceType', 'partyId', 'taxMode'] });
  const refId = useWatch({ control, name: 'referenceInvoiceId' });
  const [party, setParty] = useState<Party | null>(null);
  const service = ctx?.services.find((s) => s.id === svc);
  const fallbackService = serviceId ?? ctx?.services[0]?.id;
  useEffect(() => {
    if (!svc && fallbackService) setValue('serviceId', fallbackService);
  }, [svc, fallbackService, setValue]);
  const effectiveMode = (chosenMode || (party ? autoTaxMode(service?.state, party.state) : invoice?.taxMode ?? 'INTRA_STATE')) as TaxMode;
  const est = estimate(watchedItems, effectiveMode);
  const needsRef = invType === 'CREDIT_NOTE' || invType === 'DEBIT_NOTE';

  const fields = useQuery({ queryKey: ['/custom-fields', svc], queryFn: () => api<CustomField[]>('/custom-fields', { query: { serviceId: svc } }), enabled: !!svc });

  const save = useMutation({
    mutationFn: (body: object) => (invoice ? api<Invoice>(`/invoices/${invoice.id}`, { method: 'PATCH', body }) : api<Invoice>('/invoices', { body })),
    onSuccess: (inv) => { toast.success('Draft saved'); qc.invalidateQueries({ queryKey: ['/invoices'] }); router.push(`/app/invoices/${inv.id}`); },
  });

  const onSubmit = handleSubmit((v) => {
    const opt = <T,>(s: T | '') => s || undefined;
    const custom = Object.fromEntries(Object.entries(v.custom ?? {}).filter(([, x]) => x !== '' && x !== undefined));
    save.mutate({
      ...(!invoice && { serviceId: v.serviceId, invoiceType: v.invoiceType, referenceInvoiceId: needsRef ? opt(v.referenceInvoiceId) : undefined }),
      [purchase ? 'vendorId' : 'customerId']: v.partyId,
      externalNumber: purchase ? opt(v.externalNumber) : undefined,
      issueDate: opt(v.issueDate), dueDate: opt(v.dueDate), taxMode: opt(v.taxMode), notes: opt(v.notes), terms: opt(v.terms),
      customFieldValues: Object.keys(custom).length ? custom : undefined,
      items: v.items.map((i) => ({ productId: opt(i.productId), description: i.description, hsnSac: opt(i.hsnSac), quantity: i.quantity, unitPrice: i.unitPrice, discount: opt(i.discount), taxRate: i.taxRate || '0' })),
    });
  });

  const pickProduct = (idx: number, p?: Product) => {
    setValue(`items.${idx}.productId`, p?.id ?? '');
    if (!p) return;
    setValue(`items.${idx}.description`, p.name);
    setValue(`items.${idx}.hsnSac`, p.hsnSac ?? '');
    setValue(`items.${idx}.unitPrice`, p.unitPrice);
    setValue(`items.${idx}.taxRate`, String(Number(p.taxRate)));
  };

  return (
    <form onSubmit={onSubmit}>
      <PageHeader
        back={<Link href={invoice ? `/app/invoices/${invoice.id}` : purchase ? '/app/purchases' : '/app/invoices'} className="mb-2 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"><ArrowLeft className="size-4" /> Back</Link>}
        title={invoice ? 'Edit draft' : purchase ? 'Record purchase bill' : 'New invoice'}
        description="Totals, taxes and numbering are computed by the server when you save and issue."
        actions={<Button type="submit" loading={save.isPending}>Save draft</Button>}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Brand *">
                <Select {...register('serviceId', { required: true, setValueAs: (v) => toId(v) ?? '' })} disabled={!!invoice}>
                  {ctx?.services.map((s) => <option key={s.id} value={s.id}>{s.displayName ?? s.name}</option>)}
                </Select>
              </Field>
              {!purchase && (
                <Field label="Document type">
                  <Select {...register('invoiceType')} disabled={!!invoice}>
                    {SALES_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
                  </Select>
                </Field>
              )}
              <Field label={purchase ? 'Vendor *' : 'Customer *'} error={errors.partyId && 'Required'}>
                <input type="hidden" {...register('partyId', { required: true })} />
                <Combobox<Party>
                  path={purchase ? '/vendors' : '/customers'}
                  query={{ status: 'ACTIVE' }}
                  value={partyId || null}
                  selectedLabel={invoice ? partyName(invoice) : undefined}
                  label={(p) => p.name}
                  sub={(p) => [p.gstin, p.state].filter(Boolean).join(' · ') || undefined}
                  onChange={(id, p) => { setValue('partyId', id ?? '', { shouldValidate: true, shouldDirty: true }); setParty(p ?? null); }}
                  placeholder={purchase ? 'Search vendors…' : 'Search customers…'}
                  invalid={!!errors.partyId}
                />
              </Field>
              {purchase && <Field label="Vendor bill number"><Input {...register('externalNumber')} /></Field>}
              {needsRef && (
                <Field label="Against invoice *" error={errors.referenceInvoiceId && 'Required'}>
                  <input type="hidden" {...register('referenceInvoiceId', { required: needsRef })} />
                  <Combobox<InvoiceRow & Record<string, unknown>>
                    path="/invoices"
                    query={{ direction: 'RECEIVABLE', serviceId: svc }}
                    value={refId || null}
                    selectedLabel={invoice?.referenceInvoice?.invoiceNumber ?? undefined}
                    label={(r) => r.invoiceNumber ?? 'Draft'}
                    sub={(r) => `${partyName(r)} · ${money(r.total)}`}
                    onChange={(id) => setValue('referenceInvoiceId', id ?? '', { shouldValidate: true })}
                    disabled={!!invoice}
                    invalid={!!errors.referenceInvoiceId}
                  />
                </Field>
              )}
              <Field label="Issue date"><Input type="date" {...register('issueDate')} /></Field>
              <Field label="Due date" hint="Used for a single-stage schedule if you don't add stages"><Input type="date" {...register('dueDate')} /></Field>
              <Field label="GST treatment">
                <Select {...register('taxMode')}>
                  <option value="">Auto (from brand & party state)</option>
                  <option value="INTRA_STATE">Intra-state (CGST + SGST)</option>
                  <option value="INTER_STATE">Inter-state (IGST)</option>
                  <option value="NONE">No tax</option>
                </Select>
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Line items" action={<Button type="button" variant="secondary" size="sm" onClick={() => items.append(blankItem)}><Plus className="size-4" /> Add line</Button>} />
            <div className="divide-y">
              {items.fields.map((f, i) => (
                <div key={f.id} className="grid gap-3 p-4 sm:grid-cols-12">
                  <div className="grid gap-2 sm:col-span-5">
                    <Combobox<Product>
                      path="/products"
                      query={{ serviceId: svc, isActive: 'true' }}
                      value={watchedItems[i]?.productId || null}
                      selectedLabel={watchedItems[i]?.description || undefined}
                      label={(p) => p.name}
                      sub={(p) => `${money(p.unitPrice)} · GST ${Number(p.taxRate)}%${p.hsnSac ? ` · ${p.hsnSac}` : ''}`}
                      onChange={(_, p) => pickProduct(i, p)}
                      placeholder="Pick a product or type a custom item below"
                      clearable
                    />
                    <Input placeholder="Description *" {...register(`items.${i}.description`, { required: true })} className={errors.items?.[i]?.description && 'ring-2 ring-red-400'} />
                    <Input placeholder="HSN/SAC" {...register(`items.${i}.hsnSac`)} />
                  </div>
                  <Field label="Qty" className="sm:col-span-2"><Input inputMode="decimal" {...register(`items.${i}.quantity`, { required: true, pattern: DEC, validate: positive })} className={errors.items?.[i]?.quantity && 'ring-2 ring-red-400'} /></Field>
                  <Field label="Rate (₹)" className="sm:col-span-2"><Input inputMode="decimal" {...register(`items.${i}.unitPrice`, { required: true, pattern: DEC })} className={errors.items?.[i]?.unitPrice && 'ring-2 ring-red-400'} /></Field>
                  <Field label="Discount" className="sm:col-span-1"><Input inputMode="decimal" {...register(`items.${i}.discount`, { pattern: DEC })} /></Field>
                  <Field label="GST" className="sm:col-span-1">
                    <Select {...register(`items.${i}.taxRate`)}>{['0', '5', '12', '18', '28'].map((r) => <option key={r} value={r}>{r}%</option>)}</Select>
                  </Field>
                  <div className="flex items-end justify-end sm:col-span-1">
                    <Button type="button" variant="ghost" size="sm" disabled={items.fields.length === 1} onClick={() => items.remove(i)} aria-label="Remove line"><Trash2 className="size-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {!!fields.data?.length && (
            <Card>
              <CardHeader title="Additional fields" />
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                {fields.data.map((cf) => (
                  <Field key={cf.id} label={cf.label + (cf.required ? ' *' : '')}>
                    {cf.type === 'DROPDOWN' ? (
                      <Select {...register(`custom.${cf.key}`, { required: cf.required })}><option value="">—</option>{cf.options.map((o) => <option key={o}>{o}</option>)}</Select>
                    ) : cf.type === 'BOOLEAN' ? (
                      <input type="checkbox" className="size-4" {...register(`custom.${cf.key}`)} />
                    ) : (
                      <Input type={cf.type === 'DATE' ? 'date' : 'text'} inputMode={cf.type === 'NUMBER' || cf.type === 'CURRENCY' ? 'decimal' : undefined} {...register(`custom.${cf.key}`, { required: cf.required })} />
                    )}
                  </Field>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Notes & terms" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Notes"><Textarea {...register('notes')} /></Field>
              <Field label="Terms" hint="Leave empty to use the brand's default terms"><Textarea {...register('terms')} /></Field>
            </div>
          </Card>
        </div>

        <Card className="h-fit lg:sticky lg:top-24">
          <CardHeader title="Summary" description={`Estimate · ${TAX_LABEL[effectiveMode]}${chosenMode ? '' : ' (auto)'} — final figures come from the server`} />
          <dl className="num space-y-2 p-5 text-sm">
            <div className="flex justify-between"><dt className="text-fg-muted">Subtotal</dt><dd>{money(est.subtotal)}</dd></div>
            {effectiveMode === 'NONE' ? (
              <div className="flex justify-between"><dt className="text-fg-muted">GST</dt><dd className="text-fg-muted">Not applied</dd></div>
            ) : effectiveMode === 'INTER_STATE' ? (
              <div className="flex justify-between"><dt className="text-fg-muted">IGST</dt><dd>{money(est.igst)}</dd></div>
            ) : (
              <>
                <div className="flex justify-between"><dt className="text-fg-muted">CGST</dt><dd>{money(est.cgst)}</dd></div>
                <div className="flex justify-between"><dt className="text-fg-muted">SGST</dt><dd>{money(est.sgst)}</dd></div>
              </>
            )}
            <div className="flex justify-between border-t pt-3 text-base font-semibold"><dt>Total</dt><dd>{money(est.total)}</dd></div>
          </dl>
          <div className="border-t p-5 text-xs text-fg-muted">Add a payment schedule after saving the draft, then issue to assign the invoice number.</div>
        </Card>
      </div>
    </form>
  );
}
