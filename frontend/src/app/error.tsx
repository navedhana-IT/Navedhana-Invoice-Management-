'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { ErrorScreen } from '@/components/error-screen';
import { Button, buttonClass } from '@/components/ui';

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <ErrorScreen
      title="Something went wrong"
      description={<>This page hit an unexpected problem. Please try again.{error.digest && <span className="mt-2 block text-xs text-fg-subtle">Reference: {error.digest}</span>}</>}
      actions={<><Button size="lg" onClick={reset}>Try again</Button><Link href="/" className={buttonClass({ variant: 'secondary', size: 'lg' })}>Go to home page</Link></>}
    />
  );
}
