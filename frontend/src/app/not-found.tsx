import type { Metadata } from 'next';
import { ErrorScreen } from '@/components/error-screen';

export const metadata: Metadata = { title: 'Page not found', robots: { index: false } };

export default function NotFound() {
  return <ErrorScreen code="404" title="We couldn’t find that page" description="The link may be broken, or the page may have moved." />;
}
