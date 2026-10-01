'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { PageHeader } from '@/components/data';
import { Button, Card, CardHeader, Combobox, Dialog, Field, Input, Select, Textarea } from '@/components/ui';
import { customers, vendors } from '@/features/resources/configs';
import { ResourceForm, type ResourceConfig } from '@/features/resources/resource-page';
import { api } from '@/lib/api';
import { toId, type Id } from '@/lib/ids';
import { useSession } from '@/lib/session';
import { money, titleCase, today } from '@/lib/utils';
import { autoTaxMode, estimate, estimateLine, type TaxMode } from './estimate';
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
  const { ctx, serviceId, can } = useSession();
  const [showAddParty, setShowAddParty] = useState(false);
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
    onSuccess: (inv) => {
      toast.success('Draft saved');
      qc.invalidateQueries({ queryKey: ['/invoices'] });
      router.push(purchase || inv.direction === 'PAYABLE' ? `/app/purchases/${inv.id}` : `/app/invoices/${inv.id}`);
    },
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

  const backHref = invoice
    ? (purchase || invoice.direction === 'PAYABLE' ? `/app/purchases/${invoice.id}` : `/app/invoices/${invoice.id}`)
    : purchase ? '/app/purchases' : '/app/invoices';
  const pageTitle = invoice ? 'Edit draft' : purchase ? 'Record purchase bill' : 'New invoice';

  return (
    <form onSubmit={onSubmit}>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2.5">
            <Link
              href={backHref}
              className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-bg text-fg-muted hover:text-fg hover:bg-bg-alt shadow-xs transition-colors shrink-0"
              aria-label="Back"
              title="Back"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <span>{pageTitle}</span>
          </span>
        }
        description="Totals, taxes and numbering are computed automatically when you save and issue."
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
              <Field
                label={
                  <span className="flex items-center justify-between w-full">
                    <span>{purchase ? 'Vendor *' : 'Customer *'}</span>
                    {can(purchase ? 'vendor.create' : 'customer.create') && (
                      <button
                        type="button"
                        onClick={() => setShowAddParty(true)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-hover hover:underline cursor-pointer"
                      >
                        <Plus className="size-3.5" />
                        <span>Add {purchase ? 'vendor' : 'customer'}</span>
                      </button>
                    )}
                  </span>
                }
                error={errors.partyId && 'Required'}
              >
                <input type="hidden" {...register('partyId', { required: true })} />
                <Combobox<Party>
                  path={purchase ? '/vendors' : '/customers'}
                  query={{ status: 'ACTIVE' }}
                  value={partyId || null}
                  selectedLabel={invoice ? partyName(invoice) : party?.name ?? undefined}
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
            <CardHeader
              title="Line items"
              description="Add products or services. Totals and taxes compute automatically."
              action={
                <Button type="button" variant="secondary" size="sm" onClick={() => items.append(blankItem)}>
                  <Plus className="size-4" /> Add line
                </Button>
              }
            />
            <div className="divide-y divide-border">
              {items.fields.map((f, i) => {
                const lineEst = estimateLine(watchedItems?.[i], effectiveMode);

                return (
                  <div key={f.id} className="p-4 sm:p-5 space-y-3.5 transition-colors hover:bg-bg-alt/30">
                    {/* Header Row: Item Number, Product Catalog Selector & Line Total */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/60">
                      <div className="flex items-center gap-2.5 flex-1 min-w-[260px]">
                        <span className="inline-flex items-center justify-center size-6 rounded-md bg-bg-muted border border-border font-mono text-xs font-semibold text-fg-muted shrink-0">
                          #{i + 1}
                        </span>
                        <div className="flex-1 max-w-sm">
                          <Combobox<Product>
                            path="/products"
                            query={{ serviceId: svc, isActive: 'true' }}
                            value={watchedItems[i]?.productId || null}
                            selectedLabel={watchedItems[i]?.description || undefined}
                            label={(p) => p.name}
                            sub={(p) => `${money(p.unitPrice)} · GST ${Number(p.taxRate)}%${p.hsnSac ? ` · ${p.hsnSac}` : ''}`}
                            onChange={(_, p) => pickProduct(i, p)}
                            placeholder="Pick from product catalog (optional)…"
                            clearable
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-[11px] font-medium uppercase tracking-wider text-fg-muted block">Line amount</span>
                          <span className="font-mono text-sm font-semibold text-fg">
                            {money(lineEst.total)}
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={items.fields.length === 1}
                          onClick={() => items.remove(i)}
                          aria-label="Remove line"
                          className="text-fg-muted hover:text-danger hover:bg-danger-soft transition-colors"
                          title="Remove line"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Inputs Row 1: Description & HSN/SAC */}
                    <div className="grid gap-3 sm:grid-cols-12">
                      <Field
                        label="Item / Description *"
                        error={errors.items?.[i]?.description && 'Required'}
                        className="sm:col-span-8"
                      >
                        <Input
                          placeholder="Item or service description"
                          {...register(`items.${i}.description`, { required: true })}
                          className={errors.items?.[i]?.description && 'ring-2 ring-red-400'}
                        />
                      </Field>
                      <Field
                        label="HSN / SAC (optional)"
                        className="sm:col-span-4"
                      >
                        <Input
                          placeholder="e.g. 998311 (optional)"
                          {...register(`items.${i}.hsnSac`)}
                        />
                      </Field>
                    </div>

                    {/* Inputs Row 2: Qty, Rate, Discount, GST */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <Field
                        label="Qty *"
                        error={errors.items?.[i]?.quantity && 'Invalid'}
                      >
                        <Input
                          inputMode="decimal"
                          placeholder="1"
                          {...register(`items.${i}.quantity`, { required: true, pattern: DEC, validate: positive })}
                          className={errors.items?.[i]?.quantity && 'ring-2 ring-red-400'}
                        />
                      </Field>
                      <Field
                        label="Rate (₹) *"
                        error={errors.items?.[i]?.unitPrice && 'Invalid'}
                      >
                        <Input
                          inputMode="decimal"
                          placeholder="0.00"
                          {...register(`items.${i}.unitPrice`, { required: true, pattern: DEC })}
                          className={errors.items?.[i]?.unitPrice && 'ring-2 ring-red-400'}
                        />
                      </Field>
                      <Field
                        label="Discount (₹)"
                      >
                        <Input
                          inputMode="decimal"
                          placeholder="0.00"
                          {...register(`items.${i}.discount`, { pattern: DEC })}
                        />
                      </Field>
                      <Field
                        label="GST rate"
                      >
                        <Select {...register(`items.${i}.taxRate`)}>
                          {['0', '5', '12', '18', '28'].map((r) => (
                            <option key={r} value={r}>
                              {r}% GST
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-3.5 border-t bg-bg-alt/20 flex justify-center">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => items.append(blankItem)}
                className="w-full sm:w-auto"
              >
                <Plus className="size-4" /> Add line
              </Button>
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

      <Dialog
        open={showAddParty}
        onClose={() => setShowAddParty(false)}
        title={purchase ? 'New vendor' : 'New customer'}
        wide
      >
        {showAddParty && (
          <ResourceForm
            cfg={purchase ? (vendors as unknown as ResourceConfig<Party>) : (customers as unknown as ResourceConfig<Party>)}
            record={null}
            onDone={() => setShowAddParty(false)}
            onCreated={(newParty) => {
              setValue('partyId', newParty.id, { shouldValidate: true, shouldDirty: true });
              setParty(newParty as unknown as Party);
              setShowAddParty(false);
            }}
          />
        )}
      </Dialog>
    </form>
  );
}
