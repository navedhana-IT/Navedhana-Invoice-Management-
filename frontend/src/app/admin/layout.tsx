import type { Metadata } from 'next';
import { AdminShell } from './shell';

export const metadata: Metadata = { title: 'Admin console', robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
