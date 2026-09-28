import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from './logo';

/** Full-page friendly status screen shared by 404, error boundaries and access pages. */
export function ErrorScreen({ code, title, description, actions, bare }: { code?: string; title: string; description: ReactNode; actions?: ReactNode; bare?: boolean }) {
  return (
    <main className={bare ? 'grid place-items-center px-4 py-16' : 'grid min-h-dvh place-items-center bg-bg px-4 py-16'}>
      <div className="w-full max-w-md text-center">
        {!bare && <div className="mb-10 flex justify-center"><Logo /></div>}
        {code && <p className="bg-gradient-to-br from-indigo-500 to-violet-600 bg-clip-text text-6xl font-bold tracking-tight text-transparent">{code}</p>}
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">{title}</h1>
        <div className="mt-2 text-fg-muted">{description}</div>
        <div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row">
          {actions ?? <Link href="/" className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-fg hover:bg-primary-hover">Go to home page</Link>}
        </div>
      </div>
    </main>
  );
}
