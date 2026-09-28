import type { Metadata } from 'next';

/** Token links must not leak through the Referer header or be indexed. */
export const metadata: Metadata = { referrer: 'no-referrer', robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
