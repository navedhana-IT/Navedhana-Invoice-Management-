'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, CalendarClock, Download, Eye, FileCheck2, Mail, MoreHorizontal, Pencil, ReceiptIndianRupee, RefreshCw, Trash2, Undo2, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/data';
import { Badge, Button, buttonClass, Card, CardHeader, Dialog, DropdownMenu, Empty, ErrorState, MenuItem, Skeleton, useConfirm, usePrompt } from '@/components/ui';
import { api, openBlob } from '@/lib/api';
import { useSession } from '@/lib/session';
import { date, money, titleCase } from '@/lib/utils';
import { PaymentForm } from './payment-form';
import { SendForm } from './send-form';
import { ScheduleEditor } from './schedule-editor';
import { partyName, type Invoice } from './types';
import type { Id } from '@/lib/ids';

const OPEN = ['ISSUED', 'RECEIVED', 'PARTIALLY_PAID', 'OVERDUE'];

export function InvoiceDetail({ id }: { id: Id }) {
  const qc = useQueryClient();
  const router = useRouter();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const { can } = useSession();
  const [dialog, setDialog] = useState<'pay' | 'schedule' | 'preview' | 'send' | null>(null);
  const q = useQuery({ queryKey: ['invoice', id], queryFn: () => api<Invoice>(`/invoices/${id}`) });
  const inv = q.data;

  const refresh = () => { qc.invalidateQueries({ queryKey: ['invoice', id] }); qc.invalidateQueries({ queryKey: ['/invoices'] }); qc.invalidateQueries({ queryKey: ['/payments'] }); };
  const action = useMutation({
    mutationFn: ({ path, body, method = 'POST' }: { path: string; body?: object; label: string; method?: string }) => api(path, { method, body: method === 'DELETE' ? undefined : body ?? {} }),
    onSuccess: (_, v) => { toast.success(v.label); refresh(); },
  });

  if (q.isError) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  if (q.isLoading || !inv) return <div className="space-y-4" aria-busy><Skeleton className="h-10 w-72" /><Skeleton className="h-64" /></div>;

  const draft = inv.status === 'DRAFT';
  const paid = Number(inv.paidAmount) > 0;
  const payable = OPEN.includes(inv.status) && !['PROFORMA', 'CREDIT_NOTE', 'DEBIT_NOTE'].includes(inv.invoiceType);
  const sendable = inv.direction === 'RECEIVABLE' && !['DRAFT', 'CANCELLED', 'VOID'].includes(inv.status);
  const scheduleEditable = draft || (OPEN.includes(inv.status) && !paid);
  const label = inv.invoiceNumber ?? 'this draft';
  const listHref = inv.direction === 'PAYABLE' ? '/app/purchases' : '/app/invoices';

  const issue = async () => {
    if (await confirm({ title: `Issue ${inv.invoiceType === 'PROFORMA' ? 'proforma' : 'invoice'}?`, description: 'A number is assigned and the items and amounts are locked; they can only be cancelled or voided. Later changes to the customer, brand or default template still show on this invoice.', confirmLabel: 'Issue now' }))
      action.mutate({ path: `/invoices/${id}/issue`, label: 'Invoice issued' });
  };
  const removeDraft = async () => {
    if (await confirm({ title: 'Delete this draft?', description: 'The draft and its line items will be removed.', confirmLabel: 'Delete draft', tone: 'danger' }))
      action.mutate({ path: `/invoices/${id}`, method: 'DELETE', label: 'Draft deleted' }, { onSuccess: () => router.replace(listHref) });
  };
  const cancel = async () => {
    if (await confirm({ title: `Cancel ${label}?`, description: 'The invoice stays on record as cancelled and no further payments can be recorded against it.', confirmLabel: 'Cancel invoice', cancelLabel: 'Keep it', tone: 'danger' }))
      action.mutate({ path: `/invoices/${id}/cancel`, label: 'Invoice cancelled' });
  };
  const voidIt = async () => {
    if (await confirm({ title: `Void ${label}?`, description: 'Voiding marks the invoice as issued in error. The number is kept in sequence and cannot be reused.', confirmLabel: 'Void invoice', cancelLabel: 'Keep it', tone: 'danger' }))
      action.mutate({ path: `/invoices/${id}/void`, label: 'Invoice voided' });
  };
  const convertible = inv.invoiceType === 'PROFORMA' && !['DRAFT', 'CANCELLED', 'VOID'].includes(inv.status);
  const convert = async () => {
    if (await confirm({ title: 'Convert to tax invoice?', description: 'A draft tax invoice is created with the same customer, items and payment schedule. Review it, issue it, then record payments against it.', confirmLabel: 'Create tax invoice' }))
      action.mutate({ path: `/invoices/${id}/convert`, label: 'Draft tax invoice created' }, { onSuccess: (created) => router.push(`/app/invoices/${(created as { id: Id }).id}/edit`) });
  };
  const regenerate = async () => {
    if (await confirm({ title: 'Store a new PDF version?', description: 'A PDF copy with the current details is stored. Earlier copies are kept for audit.', confirmLabel: 'Regenerate' }))
      action.mutate({ path: `/invoices/${id}/regenerate-pdf`, label: 'New PDF version stored' });
  };
  const undo = async (paymentId: Id, kind: 'refund' | 'reverse', amount: string) => {
    const reason = await prompt({
      title: kind === 'refund' ? `Refund ${money(amount)}?` : `Reverse ${money(amount)}?`,
      description: kind === 'refund' ? 'Records money returned to the payer and reopens the balance.' : 'Undoes a payment recorded by mistake and reopens the balance.',
      label: 'Reason (kept in the audit log)', placeholder: 'e.g. Duplicate entry', minLength: 3, confirmLabel: kind === 'refund' ? 'Refund payment' : 'Reverse payment', tone: 'danger',
    });
    if (reason) action.mutate({ path: `/payments/${paymentId}/${kind}`, label: kind === 'refund' ? 'Payment refunded' : 'Payment reversed', body: { reason } });
  };
  const pdf = (path: string) => openBlob(path).catch((e: Error) => toast.error(e.message));

  return (
    <>
      <PageHeader
        back={<Link href={listHref} className="mb-2 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"><ArrowLeft className="size-4" /> {inv.direction === 'PAYABLE' ? 'Purchase bills' : 'Sales invoices'}</Link>}
        title={<span className="flex flex-wrap items-center gap-3">{inv.invoiceNumber ?? 'Draft invoice'} <Badge value={inv.status} /></span>}
        description={`${titleCase(inv.invoiceType)} · ${inv.service.name} · ${partyName(inv)}${inv.externalNumber ? ` · Bill ref ${inv.externalNumber}` : ''}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setDialog('preview')}><Eye className="size-4" /> Preview</Button>
            <Button variant="secondary" onClick={() => pdf(`/invoices/${id}/pdf`)}><Download className="size-4" /> PDF</Button>
            {sendable && can('invoice.send') && <Button variant="secondary" onClick={() => setDialog('send')}><Mail className="size-4" /> Email</Button>}
            {draft && can('invoice.update') && <Link href={inv.direction === 'PAYABLE' ? `/app/purchases/${id}/edit` : `/app/invoices/${id}/edit`} className={buttonClass({ variant: 'secondary' })}><Pencil className="size-4" /> Edit</Link>}
            {draft && can('invoice.issue') && <Button loading={action.isPending} onClick={issue}><FileCheck2 className="size-4" /> Issue</Button>}
            {convertible && can('invoice.create') && <Button loading={action.isPending} onClick={convert}><FileCheck2 className="size-4" /> Convert to tax invoice</Button>}
            {payable && can('payment.create') && <Button onClick={() => setDialog('pay')}><Wallet className="size-4" /> Record payment</Button>}
            {draft && can('invoice.delete') && <Button variant="danger-ghost" onClick={removeDraft}><Trash2 className="size-4" /> Delete</Button>}
          </>
        }
      />
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4 sm:space-y-6">
          <Card>
            <CardHeader title="Items" />
            <ul className="divide-y md:hidden">
              {inv.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0"><p className="font-medium">{i.description}</p><p className="num text-xs text-fg-muted">{Number(i.quantity)} × {money(i.unitPrice)} · GST {Number(i.taxRate)}%</p></div>
                  <p className="num shrink-0 font-medium">{money(i.lineTotal)}</p>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-surface-2 text-left text-xs uppercase text-fg-muted"><th scope="col" className="px-4 py-2">Description</th><th scope="col" className="px-4 py-2 text-right">Qty</th><th scope="col" className="px-4 py-2 text-right">Rate</th><th scope="col" className="px-4 py-2 text-right">GST</th><th scope="col" className="px-4 py-2 text-right">Amount</th></tr></thead>
                <tbody className="num divide-y">
                  {inv.items.map((i) => (
                    <tr key={i.id}>
                      <td className="px-4 py-3"><p className="font-medium">{i.description}</p>{i.hsnSac && <p className="text-xs text-fg-muted">HSN/SAC {i.hsnSac}</p>}</td>
                      <td className="px-4 py-3 text-right">{Number(i.quantity)}</td>
                      <td className="px-4 py-3 text-right">{money(i.unitPrice)}</td>
                      <td className="px-4 py-3 text-right">{Number(i.taxRate)}%</td>
                      <td className="px-4 py-3 text-right">{money(i.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Payment schedule"
              description={inv.schedule.length ? undefined : 'A single full-payment stage is created on issue if you skip this.'}
              action={scheduleEditable && can('invoice.update') && <Button variant="secondary" size="sm" onClick={() => setDialog('schedule')}><CalendarClock className="size-4" /> {inv.schedule.length ? 'Edit' : 'Add stages'}</Button>}
            />
            {inv.schedule.length === 0 ? <Empty title="No stages yet" /> : (
              <ul className="divide-y">
                {inv.schedule.map((s) => {
                  const pct = Number(s.amount) ? Math.min(100, (Number(s.paidAmount) / Number(s.amount)) * 100) : 0;
                  return (
                    <li key={s.id} className="px-4 py-4 text-sm sm:px-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">Stage {s.stageNumber}{s.description && ` · ${s.description}`}</p>
                          <p className="text-fg-muted">{s.dueType === 'NONE' ? 'No due date' : `${s.dueType === 'OPTIONAL' ? 'Target' : 'Due'} ${date(s.dueDate)}`}</p>
                        </div>
                        <div className="text-right"><p className="num font-medium">{money(s.paidAmount)} / {money(s.amount)}</p><Badge value={s.status} /></div>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`Stage ${s.stageNumber} paid`}>
                        <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Payments" />
            {inv.payments.length === 0 ? <Empty title="No payments recorded" description={payable ? 'Record a payment when money arrives.' : undefined} /> : (
              <ul className="divide-y">
                {inv.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                    <div className="min-w-0">
                      <p className="num font-medium">{money(p.amount)} <span className="font-normal text-fg-muted">via {titleCase(p.method)}</span></p>
                      <p className="text-fg-muted">
                        {p.receiptNumber && <span className="font-mono text-xs">{p.receiptNumber} · </span>}
                        {date(p.paidAt)}{p.reference && ` · ${p.reference}`}{p.reversalOfId && ' · reversal entry'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge value={p.status} />
                      {p.receiptNumber && (
                        <Button variant="ghost" size="icon-sm" aria-label={`Download ${inv.direction === 'PAYABLE' ? 'voucher' : 'receipt'} ${p.receiptNumber}`} onClick={() => pdf(`/payments/${p.id}/pdf`)}><ReceiptIndianRupee className="size-4" /></Button>
                      )}
                      {p.status === 'SUCCESS' && !p.reversalOfId && can('payment.refund') && (
                        <DropdownMenu label="Payment actions" trigger={<Button variant="ghost" size="icon-sm" aria-label="Payment actions"><MoreHorizontal className="size-4" /></Button>}>
                          <MenuItem icon={<Undo2 />} onSelect={() => undo(p.id, 'refund', p.amount)}>Refund…</MenuItem>
                          <MenuItem icon={<RefreshCw />} onSelect={() => undo(p.id, 'reverse', p.amount)}>Reverse…</MenuItem>
                        </DropdownMenu>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4 sm:space-y-6">
          <Card>
            <CardHeader title="Summary" />
            <dl className="num space-y-2 p-5 text-sm">
              <Row k="Subtotal" v={money(inv.subtotal)} />
              {Number(inv.discountTotal) > 0 && <Row k="Discount" v={`− ${money(inv.discountTotal)}`} />}
              {inv.taxMode === 'NONE' ? <Row k="GST" v="Not applied" />
                : inv.taxMode === 'INTER_STATE' ? <Row k="IGST" v={money(sumItems(inv, 'igst'))} />
                : <><Row k="CGST" v={money(sumItems(inv, 'cgst'))} /><Row k="SGST" v={money(sumItems(inv, 'sgst'))} /></>}
              <div className="flex justify-between border-t pt-3 text-base font-semibold"><dt>Total</dt><dd>{money(inv.total)}</dd></div>
              <Row k="Paid" v={money(inv.paidAmount)} />
              <div className="flex justify-between font-semibold text-primary"><dt>Balance</dt><dd>{money(inv.balanceAmount)}</dd></div>
            </dl>
          </Card>
          <Card>
            <CardHeader title="Details" />
            <dl className="space-y-2 p-5 text-sm">
              <Row k="Issue date" v={date(inv.issueDate)} />
              <Row k="Due date" v={date(inv.dueDate)} />
              <Row k="GST treatment" v={titleCase(inv.taxMode)} />
              {inv.referenceInvoice && <Row k="Against" v={<Link className="text-primary hover:underline" href={`/app/invoices/${inv.referenceInvoice.id}`}>{inv.referenceInvoice.invoiceNumber}</Link>} />}
              {Object.entries(inv.customFieldValues ?? {}).map(([k, v]) => <Row key={k} k={titleCase(k)} v={String(v)} />)}
            </dl>
          </Card>
          {!draft && (can('invoice.issue') || (OPEN.includes(inv.status) && !paid && can('invoice.cancel'))) && (
            <Card className="space-y-2 p-5">
              {can('invoice.issue') && <Button variant="secondary" className="w-full" onClick={regenerate}><RefreshCw className="size-4" /> Regenerate PDF</Button>}
              {OPEN.includes(inv.status) && !paid && can('invoice.cancel') && (
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Button variant="danger-ghost" onClick={cancel}><Ban className="size-4" /> Cancel</Button>
                  <Button variant="danger-ghost" onClick={voidIt}>Void</Button>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      <Dialog open={dialog === 'pay'} onClose={() => setDialog(null)} title="Record payment" description={`Balance due ${money(inv.balanceAmount)}`} wide><PaymentForm invoice={inv} onDone={() => setDialog(null)} /></Dialog>
      <Dialog open={dialog === 'schedule'} onClose={() => setDialog(null)} title="Payment schedule" description={`Stages must add up to ${money(inv.total)}`} wide><ScheduleEditor invoice={inv} onDone={() => setDialog(null)} /></Dialog>
      <Dialog open={dialog === 'preview'} onClose={() => setDialog(null)} title="Preview" wide><Preview path={`/invoices/${id}/preview`} /></Dialog>
      <Dialog open={dialog === 'send'} onClose={() => setDialog(null)} title={`Email ${inv.invoiceNumber}`} description="The PDF is attached. Replies go to the brand's email address.">
        {dialog === 'send' && <SendForm invoice={inv} onDone={() => setDialog(null)} />}
      </Dialog>
    </>
  );
}

const sumItems = (inv: Invoice, key: 'cgst' | 'sgst' | 'igst') =>
  (inv.items.reduce((s, i) => s + Math.round(Number(i[key]) * 100), 0) / 100).toFixed(2);

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-3"><dt className="text-fg-muted">{k}</dt><dd className="min-w-0 break-words text-right">{v}</dd></div>;
}

/** Server-rendered HTML shown in a fully sandboxed iframe (no scripts, no same-origin). */
export function Preview({ path, body }: { path: string; body?: object }) {
  const q = useQuery({ queryKey: ['preview', path, body], queryFn: () => api<string>(path, body ? { body } : {}) });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <Skeleton className="h-[70vh]" />;
  return <iframe sandbox="" srcDoc={q.data} title="Invoice preview" className="h-[70vh] w-full rounded-lg border bg-white" />;
}
