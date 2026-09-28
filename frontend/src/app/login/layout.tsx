import { pageMeta } from '@/lib/seo';

export const metadata = pageMeta('Sign in', 'Sign in to your Navedhana Ledger workspace.', '/login');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
