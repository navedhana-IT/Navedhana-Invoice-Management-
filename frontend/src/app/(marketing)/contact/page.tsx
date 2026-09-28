import { Clock, LifeBuoy, Mail } from 'lucide-react';
import Link from 'next/link';
import { CONTACT_EMAIL, pageMeta, SUPPORT_EMAIL } from '@/lib/seo';

export const metadata = pageMeta('Contact', 'Talk to the Navedhana Ledger team about multi-brand invoicing for your company.', '/contact');

const cards = [
  { icon: Mail, title: 'Sales & demos', text: 'Plans, onboarding and multi-company setups.', href: `mailto:${CONTACT_EMAIL}?subject=Navedhana%20Ledger%20enquiry`, cta: CONTACT_EMAIL },
  { icon: LifeBuoy, title: 'Customer support', text: 'Help with your workspace, invoices or billing.', href: `mailto:${SUPPORT_EMAIL}?subject=Support%20request`, cta: SUPPORT_EMAIL },
  { icon: Clock, title: 'Hours', text: 'Monday to Friday, 10:00–18:00 IST. We usually reply within one business day.' },
];

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20">
      <h1 className="text-4xl font-semibold tracking-tight">Let&apos;s talk</h1>
      <p className="mt-4 max-w-2xl text-lg text-fg-muted">Tell us about your brands and billing workflow. Or skip the call and <Link href="/signup" className="font-medium text-primary hover:underline">start a free trial</Link> right away.</p>
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {cards.map((c) => {
          const body = (
            <>
              <c.icon className="size-10 rounded-xl bg-primary-soft p-2.5 text-primary" aria-hidden />
              <p className="mt-4 font-medium">{c.title}</p>
              <p className="mt-1 text-sm text-fg-muted">{c.text}</p>
              {c.cta && <p className="mt-3 break-all text-sm font-medium text-primary">{c.cta}</p>}
            </>
          );
          return c.href
            ? <a key={c.title} href={c.href} className="rounded-2xl border bg-surface p-6 shadow-sm transition hover:border-primary hover:shadow-md">{body}</a>
            : <div key={c.title} className="rounded-2xl border bg-surface p-6 shadow-sm">{body}</div>;
        })}
      </div>
    </div>
  );
}
