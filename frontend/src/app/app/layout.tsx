import type { Metadata } from 'next';
import { AppShell } from './shell';

export const metadata: Metadata = { title: 'Workspace', robots: { index: false, follow: false } };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
