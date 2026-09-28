import {
  ArrowRight, BadgeCheck, BarChart3, Building2, Check, FileLock2, Fingerprint, Hash, History, KeyRound, LayoutTemplate, Lock, Palette, Receipt, ShieldCheck, Truck, UserPlus, Users, UsersRound,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { features } from '@/content/site';
import { cn } from '@/lib/utils';
import { Counter, Reveal } from './motion';
import { StageTimeline } from './stage-timeline';

export function SectionHeading({ eyebrow, title, text, center = true }: { eyebrow: string; title: ReactNode; text?: ReactNode; center?: boolean }) {
  return (
    <Reveal className={cn('max-w-2xl', center && 'mx-auto text-center')}>
      <p className="text-sm font-semibold text-primary">{eyebrow}</p>
      <h2 className="mt-2 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {text && <p className="mt-4 text-pretty text-fg-muted sm:text-lg">{text}</p>}
    </Reveal>
  );
}

function Section({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return <section id={id} className={cn('scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24', className)}><div className="mx-auto max-w-6xl">{children}</div></section>;
}

export function Stats() {
  return (
    <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-4 pb-4 text-center sm:px-6 md:grid-cols-4">
      {[
        { to: 7, suffix: '', label: 'numbering series per brand' },
        { to: 6, suffix: '', label: 'document types' },
        { to: 3, suffix: '', label: 'due-date modes per stage' },
        { to: 100, suffix: '%', label: 'server-side tax calculation' },
      ].map((s) => (
        <Reveal key={s.label}>
          <p className="num text-3xl font-semibold tracking-tight sm:text-4xl"><Counter to={s.to} suffix={s.suffix} /></p>
          <p className="mt-1 text-sm text-fg-muted">{s.label}</p>
        </Reveal>
      ))}
    </div>
  );
}

export function Bento() {
  const [a, b, c, d, e, f, g, h, i] = features;
  const Tile = ({ f, className, children }: { f: (typeof features)[number]; className?: string; children?: ReactNode }) => (
    <Reveal className={cn('group relative overflow-hidden rounded-2xl border bg-surface p-6 shadow-sm transition hover:shadow-md', className)}>
      <f.icon className="size-10 rounded-xl bg-primary-soft p-2.5 text-primary" aria-hidden />
      <h3 className="mt-4 font-semibold">{f.title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{f.text}</p>
      {children}
    </Reveal>
  );
  return (
    <Section id="capabilities">
      <SectionHeading eyebrow="Capabilities" title="Everything you need to bill, collect and report" text="Designed for companies that run more than one brand — without running more than one system." />
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        <Tile f={a} className="md:col-span-2">
          <div className="mt-5 flex flex-wrap gap-2" aria-hidden>
            {['Navedhana Solar', 'Lotus Power', 'Agri Care'].map((n, k) => (
              <span key={n} className="inline-flex items-center gap-2 rounded-full border bg-surface-2 px-3 py-1 text-xs"><span className={cn('size-2 rounded-full', ['bg-indigo-500', 'bg-amber-500', 'bg-emerald-500'][k])} />{n}</span>
            ))}
          </div>
        </Tile>
        <Tile f={b} />
        <Tile f={c} />
        <Tile f={d} />
        <Tile f={e} />
        <Tile f={f} />
        <Tile f={g} />
        <Tile f={h} />
        <Tile f={i} className="md:col-span-3" />
      </div>
    </Section>
  );
}

export function Architecture() {
  const brands = [
    { name: 'Navedhana Solar', code: 'NSS', color: 'from-indigo-500 to-violet-500' },
    { name: 'Lotus Solar Power', code: 'LSP', color: 'from-amber-500 to-orange-500' },
    { name: 'Navedhana Agri', code: 'NAG', color: 'from-emerald-500 to-teal-500' },
  ];
  return (
    <Section id="architecture" className="bg-surface-2">
      <SectionHeading eyebrow="Multi-company architecture" title="One workspace per company. As many brands as you run." text="Customers, vendors, employees and your team live at company level. Each brand brings its own identity, numbering and templates — and access can be limited brand by brand." />
      <Reveal className="mt-12">
        <div className="mx-auto max-w-4xl" aria-label="Company, brand and document hierarchy">
          <div className="mx-auto flex w-fit items-center gap-3 rounded-2xl border bg-surface px-5 py-4 shadow-md">
            <Building2 className="size-9 rounded-xl bg-primary-soft p-2 text-primary" aria-hidden />
            <div><p className="font-semibold">Navedhana Group Pvt Ltd</p><p className="text-xs text-fg-muted">Company · shared customers, vendors, team</p></div>
          </div>
          <div className="mx-auto h-8 w-px bg-border-strong" aria-hidden />
          <div className="mx-auto hidden h-px w-2/3 bg-border-strong md:block" aria-hidden />
          <div className="grid gap-4 md:mt-0 md:grid-cols-3">
            {brands.map((b) => (
              <div key={b.code} className="flex flex-col items-center">
                <div className="hidden h-8 w-px bg-border-strong md:block" aria-hidden />
                <div className="w-full rounded-2xl border bg-surface p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className={cn('grid size-9 place-items-center rounded-lg bg-gradient-to-br text-xs font-bold text-white', b.color)}>{b.code}</span>
                    <p className="font-medium">{b.name}</p>
                  </div>
                  <ul className="mt-3 space-y-1 font-mono text-[11px] text-fg-muted">
                    <li>{b.code}-INV-000001</li><li>{b.code}-RCT-000001</li><li>{b.code}-PUR-000001</li>
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </Section>
  );
}

function Split({ id, eyebrow, title, text, points, visual, flip, className }: { id?: string; eyebrow: string; title: string; text: string; points: string[]; visual: ReactNode; flip?: boolean; className?: string }) {
  return (
    <Section id={id} className={className}>
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className={cn(flip && 'lg:order-2')}>
          <SectionHeading eyebrow={eyebrow} title={title} text={text} center={false} />
          <Reveal delay={0.1}>
            <ul className="mt-6 space-y-2.5">
              {points.map((p) => <li key={p} className="flex gap-2.5 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />{p}</li>)}
            </ul>
          </Reveal>
        </div>
        <Reveal delay={0.15} className={cn(flip && 'lg:order-1')}>{visual}</Reveal>
      </div>
    </Section>
  );
}

export function Numbering() {
  const rows = [['Tax invoice', 'LSP-INV-000128'], ['Proforma', 'LSP-PF-000019'], ['Credit note', 'LSP-CN-000004'], ['Purchase bill', 'LSP-PUR-000311'], ['Receipt', 'LSP-RCT-000112'], ['Payment voucher', 'LSP-PV-000087']];
  return (
    <Split
      id="invoicing"
      eyebrow="Invoicing & numbering"
      title="Clean, gap-free numbers for every brand and document"
      text="Each brand has its own series for invoices, proformas, notes, purchases, receipts and vouchers. Numbers are claimed atomically on issue — never duplicated, never skipped."
      points={['Tokens for brand code, year, month and Indian financial year', 'Yearly or financial-year resets, custom padding and start number', 'Items and totals locked the moment you issue', 'CGST/SGST or IGST decided by place of supply']}
      visual={
        <div className="rounded-2xl border bg-surface p-5 shadow-md">
          <div className="flex items-center gap-2 text-sm font-semibold"><Hash className="size-4 text-primary" aria-hidden /> Lotus Solar Power · numbering</div>
          <ul className="mt-4 divide-y text-sm">
            {rows.map(([k, v]) => <li key={k} className="flex items-center justify-between py-2.5"><span className="text-fg-muted">{k}</span><span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs">{v}</span></li>)}
          </ul>
          <p className="mt-3 rounded-lg bg-primary-soft px-3 py-2 font-mono text-[11px] text-primary">{'{CODE}-INV-{SEQ}'} · padding 6 · reset never</p>
        </div>
      }
    />
  );
}

export function Schedules() {
  return (
    <Split
      id="payments"
      flip
      className="bg-surface-2"
      eyebrow="Payment schedules"
      title="Advance, milestones and retention — tracked to the rupee"
      text="Split any invoice into stages with fixed, target or no due dates. Payments are allocated oldest-due first, and status is always derived from money actually received."
      points={['Partial payments, refunds and reversals with a reason trail', 'Numbered receipts for sales and vouchers for purchases', 'Only fixed due dates can make a stage overdue', 'Overdue alerts in the app and by email']}
      visual={<StageTimeline />}
    />
  );
}

function MiniCard({ icon: Icon, title, text }: { icon: typeof Users; title: string; text: string }) {
  return (
    <Reveal className="rounded-2xl border bg-surface p-6 shadow-sm">
      <Icon className="size-10 rounded-xl bg-primary-soft p-2.5 text-primary" aria-hidden />
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{text}</p>
    </Reveal>
  );
}

export function People() {
  return (
    <Section id="people">
      <SectionHeading eyebrow="Customers, vendors & team" title="Everyone you work with, in one directory" />
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MiniCard icon={UsersRound} title="Customers" text="GSTIN, PAN, state and addresses — reused across every brand's invoices." />
        <MiniCard icon={Truck} title="Vendors" text="Record purchase bills with the vendor's own number and track what you owe." />
        <MiniCard icon={UserPlus} title="Employees" text="Keep staff records by department and invite them to the workspace in one step." />
        <MiniCard icon={Users} title="Roles & access" text="System and custom roles, scoped to the whole company or specific brands." />
      </div>
    </Section>
  );
}

export function Templates() {
  return (
    <Split
      id="templates"
      eyebrow="Template builder"
      title="Invoices that look like your brand — not like software"
      text="Drag blocks into place, pick colours and fonts, add custom fields and images. Publish a version when it's ready; drafts never affect live invoices."
      points={['Versioned templates with a default per brand', 'Custom fields for PO numbers, site IDs or anything else', 'Server-rendered PDFs stored immutably', 'Live preview with sample data']}
      visual={
        <div className="rounded-2xl border bg-surface p-5 shadow-md" aria-hidden>
          <div className="flex items-center gap-2 text-sm font-semibold"><LayoutTemplate className="size-4 text-primary" /> Classic · v3 <span className="ml-auto rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-medium text-success">Published</span></div>
          <div className="mt-4 rounded-lg border bg-white p-4 text-slate-800">
            <div className="flex items-start justify-between border-b-2 border-indigo-500 pb-2"><div className="h-6 w-20 rounded bg-indigo-100" /><div className="space-y-1 text-right"><div className="ml-auto h-2 w-24 rounded bg-slate-200" /><div className="ml-auto h-2 w-16 rounded bg-slate-200" /></div></div>
            <div className="mt-3 grid grid-cols-2 gap-2">{[0, 1].map((k) => <div key={k} className="h-12 rounded border border-dashed border-slate-300 bg-slate-50" />)}</div>
            <div className="mt-2 h-20 rounded border border-dashed border-indigo-300 bg-indigo-50/60" />
            <div className="mt-2 grid grid-cols-3 gap-2">{[0, 1, 2].map((k) => <div key={k} className="h-8 rounded border border-dashed border-slate-300 bg-slate-50" />)}</div>
          </div>
          <div className="mt-3 flex gap-2">{['#4f46e5', '#0ea5e9', '#16a34a', '#ea580c'].map((c) => <span key={c} className="size-6 rounded-full ring-2 ring-white" style={{ background: c }} />)}<Palette className="ml-auto size-5 text-fg-muted" /></div>
        </div>
      }
    />
  );
}

export function Security() {
  const items = [
    { icon: Lock, title: 'Tenant isolation', text: 'Every query is scoped to your company and permitted brands on the server.' },
    { icon: KeyRound, title: 'Least-privilege roles', text: 'Grant only the permissions a person needs. Nobody can grant more than they hold.' },
    { icon: History, title: 'Append-only audit log', text: 'Who changed what, when and from where — with before and after values.' },
    { icon: FileLock2, title: 'Private documents', text: 'PDFs and logos are streamed through the API; storage URLs are never exposed.' },
    { icon: Fingerprint, title: 'Secure sessions', text: 'Short-lived access tokens, rotating refresh cookies and throttled sign-in.' },
    { icon: BadgeCheck, title: 'Signed invitations', text: 'Single-use, time-limited, revocable invites — no shared passwords.' },
  ];
  return (
    <Section id="security" className="bg-slate-950 text-slate-100">
      <Reveal className="mx-auto max-w-2xl text-center">
        <ShieldCheck className="mx-auto size-11 rounded-xl bg-white/10 p-2.5 text-indigo-300" aria-hidden />
        <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Security that auditors appreciate</h2>
        <p className="mt-4 text-slate-400 sm:text-lg">Financial records demand more than a login screen. Protection is built into every layer.</p>
      </Reveal>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it, k) => (
          <Reveal key={it.title} delay={k * 0.04} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <it.icon className="size-5 text-indigo-300" aria-hidden />
            <h3 className="mt-3 font-semibold text-white">{it.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{it.text}</p>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

export function Reports() {
  const aging = [['Not due', 62], ['1–30', 24], ['31–60', 9], ['61–90', 3], ['90+', 2]] as const;
  return (
    <Split
      id="reports"
      eyebrow="Reports"
      title="Know exactly who owes what — by brand, by month"
      text="Sales, purchases, receivables and payables aging, GST summaries, collections by method and revenue trends. Filter by date and brand, export to CSV."
      points={['Receivables & payables aging buckets', 'CGST / SGST / IGST summaries by month', 'Collections by payment method', 'Per-brand revenue comparison']}
      visual={
        <div className="rounded-2xl border bg-surface p-5 shadow-md">
          <div className="flex items-center gap-2 text-sm font-semibold"><BarChart3 className="size-4 text-primary" aria-hidden /> Receivables aging</div>
          <ul className="mt-5 space-y-3">
            {aging.map(([k, v]) => (
              <li key={k} className="grid grid-cols-[64px_1fr_40px] items-center gap-3 text-sm">
                <span className="text-fg-muted">{k}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${v}%` }} /></span>
                <span className="num text-right text-fg-muted">{v}%</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 grid grid-cols-3 gap-2 border-t pt-4 text-center">
            {[['CGST', '₹1.2L'], ['SGST', '₹1.2L'], ['IGST', '₹0.8L']].map(([k, v]) => <div key={k}><p className="text-[11px] text-fg-muted">{k}</p><p className="num text-sm font-semibold">{v}</p></div>)}
          </div>
        </div>
      }
    />
  );
}

export function Receipts() {
  return (
    <Section className="pt-0 sm:pt-0">
      <Reveal className="flex flex-col items-start gap-4 rounded-2xl border bg-surface p-6 shadow-sm sm:flex-row sm:items-center sm:p-8">
        <Receipt className="size-11 shrink-0 rounded-xl bg-primary-soft p-2.5 text-primary" aria-hidden />
        <div className="flex-1"><h3 className="font-semibold">Receipts and vouchers, automatically</h3><p className="mt-1 text-sm text-fg-muted">Every successful payment gets its own numbered receipt (money in) or payment voucher (money out), ready to download as a PDF.</p></div>
      </Reveal>
    </Section>
  );
}

export function Cta({ trialDays }: { trialDays?: number }) {
  return (
    <Section>
      <Reveal className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-6 py-14 text-center text-white shadow-lg sm:px-12 sm:py-16">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.18),transparent_45%)]" />
        <h2 className="relative text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Bring every brand into one ledger</h2>
        <p className="relative mx-auto mt-4 max-w-xl text-indigo-100">Set up your company, first brand and invoice numbering in a few minutes.{trialDays ? ` Free for ${trialDays} days.` : ''}</p>
        <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/signup" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 font-medium text-indigo-700 shadow-sm transition hover:bg-indigo-50">Create your workspace <ArrowRight className="size-4" aria-hidden /></Link>
          <Link href="/contact" className="inline-flex h-12 items-center justify-center rounded-xl border border-white/30 px-6 font-medium transition hover:bg-white/10">Talk to us</Link>
        </div>
      </Reveal>
    </Section>
  );
}
