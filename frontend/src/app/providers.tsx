'use client';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { ThemeProvider } from 'next-themes';
import { useState } from 'react';
import { toast, Toaster } from 'sonner';
import { ConfirmProvider, TooltipProvider } from '@/components/ui';
import { ApiError } from '@/lib/api';

function notify(e: Error) {
  if (e instanceof ApiError) {
    const extra = e.errors && e.errors.length > 1 ? e.errors.slice(1, 4).join(' · ') : undefined;
    toast.error(e.message, { description: extra ?? (e.status >= 500 && e.requestId ? `Reference: ${e.requestId}` : undefined) });
  } else {
    toast.error('Something went wrong. Please try again.');
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  // Theme preference applies inside the product only; public and auth pages are always light.
  const themed = path.startsWith('/app') || path.startsWith('/admin');
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2 },
        },
        // Every failed mutation surfaces the backend's friendly message; screens opt out with meta.silent.
        mutationCache: new MutationCache({ onError: (e, _v, _c, m) => { if (!m.meta?.silent) notify(e); } }),
      }),
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} forcedTheme={themed ? undefined : 'light'} disableTransitionOnChange>
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </TooltipProvider>
        <Toaster richColors closeButton position="top-right" toastOptions={{ duration: 5000 }} />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
