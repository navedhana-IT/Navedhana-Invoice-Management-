import Link from 'next/link';
import { cn } from '@/lib/utils';
import { SITE_NAME } from '@/lib/seo';

/** Ledger "N" mark: two stacked sheets forming an N, on an indigo→violet tile. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8 shrink-0', className)} aria-hidden>
      <defs>
        <linearGradient id="nv-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#nv-mark)" />
      <path d="M9 23V9.5l14 13V9" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 26.5h14" stroke="#fff" strokeOpacity=".45" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ href = '/', endorsed = true, className }: { href?: string; endorsed?: boolean; className?: string }) {
  return (
    <Link href={href} className={cn('flex items-center gap-2.5 rounded-lg', className)} aria-label={`${SITE_NAME} home`}>
      <BrandMark />
      <span className="flex flex-col leading-none">
        <span className="font-semibold tracking-tight">{SITE_NAME}</span>
        {endorsed && <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-fg-subtle">A Navedhana Product</span>}
      </span>
    </Link>
  );
}
