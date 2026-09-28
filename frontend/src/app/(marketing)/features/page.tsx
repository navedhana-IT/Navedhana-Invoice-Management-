import { Architecture, Bento, Cta, Numbering, People, Reports, Schedules, Security, Templates } from '@/components/marketing/sections';
import { pageMeta } from '@/lib/seo';

export const metadata = pageMeta('Features', 'Multi-brand GST invoicing, numbering, payment schedules, receipts, template builder, reports and audit logs.', '/features');

export default function FeaturesPage() {
  return (
    <>
      <section className="px-4 pb-4 pt-16 text-center sm:px-6 sm:pt-20">
        <h1 className="mx-auto max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">Everything a multi-brand business needs to bill and collect</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-fg-muted">Financial figures are always computed by the backend, so what you see is what gets filed.</p>
      </section>
      <Bento />
      <Architecture />
      <Numbering />
      <Schedules />
      <People />
      <Templates />
      <Security />
      <Reports />
      <Cta />
    </>
  );
}
