import Link from 'next/link';
import { BrandMark, Logo } from '@/components/logo';
import { MobileNav } from '@/components/marketing/mobile-nav';
import { MotionProvider } from '@/components/marketing/motion';
import { CONTACT_EMAIL, SITE_NAME, SUPPORT_EMAIL } from '@/lib/seo';

const nav = [
  { href: '/features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/#faq', label: 'FAQ' },
  { href: '/blog', label: 'Blog' },
  { href: '/contact', label: 'Contact' },
];

const footer = [
  { title: 'Product', links: [{ href: '/features', label: 'Features' }, { href: '/pricing', label: 'Pricing' }, { href: '/#security', label: 'Security' }, { href: '/signup', label: 'Start free trial' }] },
  { title: 'Resources', links: [{ href: '/blog', label: 'Blog' }, { href: '/#faq', label: 'FAQ' }, { href: '/contact', label: 'Contact' }] },
  { title: 'Account', links: [{ href: '/login', label: 'Sign in' }, { href: '/forgot-password', label: 'Reset password' }] },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <MotionProvider>
      <div className="flex min-h-dvh flex-col bg-bg">
        <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-fg">Skip to content</a>
        <header className="sticky top-0 z-30 border-b bg-surface/80 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
            <Logo />
            <nav className="hidden gap-7 text-sm text-fg-muted md:flex" aria-label="Main">
              {nav.map((n) => <Link key={n.href} href={n.href} className="transition-colors hover:text-fg">{n.label}</Link>)}
            </nav>
            <div className="flex items-center gap-2 text-sm">
              <Link href="/login" className="hidden rounded-lg px-3 py-2 font-medium hover:text-primary sm:block">Sign in</Link>
              <Link href="/signup" className="hidden rounded-lg bg-primary px-4 py-2 font-medium text-primary-fg shadow-sm transition hover:bg-primary-hover sm:block">Start free</Link>
              <MobileNav nav={nav} />
            </div>
          </div>
        </header>
        <main id="content" className="flex-1">{children}</main>
        <footer className="border-t bg-surface">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
            <div>
              <Logo />
              <p className="mt-4 max-w-xs text-sm text-fg-muted">Multi-brand GST invoicing, payment schedules, receipts and reports for growing Indian companies.</p>
              <p className="mt-4 text-sm text-fg-muted">
                <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-fg">{CONTACT_EMAIL}</a><br />
                <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-fg">{SUPPORT_EMAIL}</a>
              </p>
            </div>
            {footer.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <p className="text-sm font-semibold">{col.title}</p>
                <ul className="mt-3 space-y-2 text-sm text-fg-muted">
                  {col.links.map((l) => <li key={l.href}><Link href={l.href} className="hover:text-fg">{l.label}</Link></li>)}
                </ul>
              </nav>
            ))}
          </div>
          <div className="border-t">
            <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-fg-subtle sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p>© {new Date().getFullYear()} {SITE_NAME}. All rights reserved.</p>
              <p className="flex items-center gap-2"><BrandMark className="size-4" /> A Navedhana Product</p>
            </div>
          </div>
        </footer>
      </div>
    </MotionProvider>
  );
}
