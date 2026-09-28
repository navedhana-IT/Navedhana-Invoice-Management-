'use client';
import { useEffect } from 'react';
import { Button, Card, describeError } from '@/components/ui';

/** In-shell error boundary body: keeps navigation usable while one screen fails. */
export function ShellRouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  const d = describeError(error);
  return (
    <Card className="mx-auto max-w-lg p-8 text-center">
      <div className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-danger-soft text-danger" aria-hidden>{d.icon}</div>
      <h1 className="text-lg font-semibold">{d.title}</h1>
      <p className="mt-1 text-sm text-fg-muted">{d.description}</p>
      {error.digest && <p className="mt-2 text-xs text-fg-subtle">Reference: {error.digest}</p>}
      <Button className="mt-6" onClick={reset}>Try again</Button>
    </Card>
  );
}
