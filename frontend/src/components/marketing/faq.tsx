import { ChevronDown } from 'lucide-react';
import { faqs } from '@/content/site';
import { jsonLd } from '@/lib/seo';
import { Reveal } from './motion';
import { SectionHeading } from './sections';

/** Native <details> accordion: keyboard and screen-reader support without JavaScript. */
export function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      })} />
      <div className="mx-auto max-w-3xl">
        <SectionHeading eyebrow="FAQ" title="Questions, answered" />
        <Reveal className="mt-10 divide-y rounded-2xl border bg-surface shadow-sm">
          {faqs.map((f) => (
            <details key={f.q} className="group px-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium">
                {f.q}
                <ChevronDown className="size-4 shrink-0 text-fg-muted transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <p className="pb-5 text-sm leading-relaxed text-fg-muted">{f.a}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
