import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { SITE_NAME } from '@/lib/seo';

/** Brand mark: the distinctive "n" arch with orange accent leaf from the official logo. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn('relative inline-flex items-center justify-center shrink-0', className)}>
      <Image
        src="/logo-mark.png"
        alt=""
        width={48}
        height={48}
        priority
        className="size-full object-contain dark:hidden"
      />
      <Image
        src="/logo-mark-dark.png"
        alt=""
        width={48}
        height={48}
        priority
        className="hidden size-full object-contain dark:block"
      />
    </span>
  );
}

/** Full logo: "nbills - A Navedhana Product" with the mark and wordmark. */
export function Logo({
  href = '/',
  endorsed: _endorsed,
  className,
  imageClassName,
}: {
  href?: string;
  endorsed?: boolean;
  className?: string;
  imageClassName?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center rounded-lg transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring select-none',
        className
      )}
      aria-label={`${SITE_NAME} home`}
    >
      <Image
        src="/logo.png"
        alt={SITE_NAME}
        width={154}
        height={60}
        priority
        className={cn('h-9 w-auto max-w-[170px] object-contain dark:hidden', imageClassName)}
      />
      <Image
        src="/logo-dark.png"
        alt={SITE_NAME}
        width={154}
        height={60}
        priority
        className={cn('hidden h-9 w-auto max-w-[170px] object-contain dark:block', imageClassName)}
      />
    </Link>
  );
}
