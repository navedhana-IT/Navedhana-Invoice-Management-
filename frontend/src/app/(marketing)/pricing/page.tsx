import { Faq } from '@/components/marketing/faq';
import { PricingCards } from '@/components/marketing/pricing';
import { Cta, SectionHeading } from '@/components/marketing/sections';
import { getPlans, jsonLd, pageMeta, SITE_NAME } from '@/lib/seo';

export const revalidate = 3600;
export const metadata = pageMeta('Pricing', 'Plans for multi-brand GST invoicing, payment schedules and reports — with a free trial.', '/pricing');

export default async function PricingPage() {
  const fetched = await getPlans();
  // At runtime a failed fetch throws so ISR keeps serving the last good page; builds may run without the API.
  if (!fetched && process.env.NEXT_PHASE !== 'phase-production-build') throw new Error('Plans unavailable');
  const plans = fetched ?? [];
  const trialDays = Math.max(0, ...plans.map((p) => p.trialDays));
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd({
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: SITE_NAME,
          brand: { '@type': 'Brand', name: 'Navedhana' },
          offers: plans.map((p) => ({ '@type': 'Offer', name: p.name, price: p.price, priceCurrency: p.currency })),
        })}
      />
      <section className="px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Pricing" title="Simple plans that grow with your brands" text="Every plan includes GST invoicing, payment schedules, receipts and the audit log. Taxes extra." />
          <PricingCards plans={plans} />
        </div>
      </section>
      <Faq />
      <Cta trialDays={trialDays || undefined} />
    </>
  );
}
