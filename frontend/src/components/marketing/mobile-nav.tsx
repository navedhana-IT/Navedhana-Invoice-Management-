'use client';
import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/logo';
import { Sheet } from '@/components/ui';

export function MobileNav({ nav }: { nav: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-muted md:hidden" aria-label="Open menu" aria-expanded={open}><Menu className="size-5" /></button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Menu" side="right">
        <div className="flex h-16 items-center justify-between border-b px-5">
          <Logo />
          <button onClick={() => setOpen(false)} className="rounded-md p-1.5 text-fg-muted hover:bg-muted" aria-label="Close menu"><X className="size-4" /></button>
        </div>
        <nav className="flex-1 p-3" aria-label="Mobile">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path === n.href ? 'page' : undefined}
              className="block rounded-lg px-3 py-3 font-medium hover:bg-muted aria-[current=page]:text-primary">{n.label}</Link>
          ))}
        </nav>
        <div className="grid gap-2 border-t p-4">
          <Link href="/signup" className="inline-flex h-11 items-center justify-center rounded-xl bg-primary font-medium text-primary-fg">Start free trial</Link>
          <Link href="/login" className="inline-flex h-11 items-center justify-center rounded-xl border font-medium">Sign in</Link>
        </div>
      </Sheet>
    </>
  );
}
