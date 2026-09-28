import { Faq } from '@/components/marketing/faq';
import { Hero } from '@/components/marketing/hero';
import { PricingCards } from '@/components/marketing/pricing';
import { Architecture, Bento, Cta, Numbering, People, Receipts, Reports, Schedules, SectionHeading, Security, Stats, Templates } from '@/components/marketing/sections';
import { getPlans, jsonLd, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/seo';

export const revalidate = 3600;

export default async function Home() {
  const plans = (await getPlans()) ?? [];
  const trialDays = Math.max(0, ...plans.map((p) => p.trialDays));
  const prices = plans.map((p) => Number(p.price)).filter((n) => n > 0);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd({
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: SITE_NAME,
          url: SITE_URL,
          description: SITE_DESCRIPTION,
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web',
          publisher: { '@type': 'Organization', name: 'Navedhana' },
          ...(prices.length && { offers: { '@type': 'AggregateOffer', priceCurrency: 'INR', lowPrice: String(Math.min(...prices)), highPrice: String(Math.max(...prices)), offerCount: prices.length } }),
        })}
      />
      <Hero trialDays={trialDays || undefined} />
      <Stats />
      <Bento />
      <Architecture />
      <Numbering />
      <Schedules />
      <Receipts />
      <People />
      <Templates />
      <Security />
      <Reports />
      <section id="pricing" className="scroll-mt-20 bg-surface-2 px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Pricing" title="Simple plans that grow with your brands" text="Start with a free trial. Upgrade, downgrade or cancel whenever you need." />
          <PricingCards plans={plans} />
        </div>
      </section>
      <Faq />
      <Cta trialDays={trialDays || undefined} />
    </>
  );
}
