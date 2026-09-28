import { CheckCircle2 } from 'lucide-react';
import { Logo } from '@/components/logo';
import { cn } from '@/lib/utils';

const POINTS = [
  'Separate branding, numbering and templates for every brand',
  'Payment schedules with receipts and vouchers',
  'GST, receivables and payables reports',
];

/** Split layout for sign-in, sign-up, invitation and password pages. */
export function AuthShell({ title, subtitle, children, footer, wide }: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cn('grid min-h-dvh bg-bg', wide ? 'xl:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)]' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]')}>
      <main id="main" className="flex flex-col px-5 py-8 sm:px-10 lg:px-16">
        <Logo href="/" />
        <div className={cn('mx-auto flex w-full flex-1 flex-col justify-center py-10', wide ? 'max-w-2xl' : 'max-w-sm')}>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-fg-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-sm text-fg-muted">{footer}</div>}
        </div>
        <p className="text-xs text-fg-subtle">© {new Date().getFullYear()} Navedhana Ledger · A Navedhana Product</p>
      </main>
      <aside className={cn('relative hidden overflow-hidden bg-gradient-to-br from-indigo-950 via-indigo-800 to-violet-700 p-16 text-white', wide ? 'xl:flex xl:flex-col xl:justify-between' : 'lg:flex lg:flex-col lg:justify-between')}>
        <div aria-hidden className="absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden className="absolute -bottom-32 -left-16 size-96 rounded-full bg-violet-400/20 blur-3xl" />
        <p className="relative text-sm font-medium uppercase tracking-[0.2em] text-indigo-200">A Navedhana Product</p>
        <div className="relative">
          <p className="text-3xl font-semibold leading-snug">Every brand. Every invoice. One ledger.</p>
          <ul className="mt-8 grid gap-3 text-indigo-100">
            {POINTS.map((p) => (
              <li key={p} className="flex gap-3"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-indigo-300" aria-hidden />{p}</li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
