import Link from 'next/link';
import { notFound } from 'next/navigation';
import { posts } from '@/content/site';
import { jsonLd, pageMeta } from '@/lib/seo';
import { date } from '@/lib/utils';

type Props = { params: Promise<{ slug: string }> };

export const generateStaticParams = () => posts.map((p) => ({ slug: p.slug }));

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const p = posts.find((x) => x.slug === slug);
  return p ? { ...pageMeta(p.title, p.excerpt, `/blog/${p.slug}`), openGraph: { type: 'article', publishedTime: p.date } } : {};
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  const p = posts.find((x) => x.slug === slug);
  if (!p) notFound();
  return (
    <article className="mx-auto max-w-2xl px-6 py-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd({ '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, datePublished: p.date, description: p.excerpt, publisher: { '@type': 'Organization', name: 'Navedhana' } })} />
      <Link href="/blog" className="text-sm font-medium text-primary hover:underline">← All posts</Link>
      <time className="mt-6 block text-sm text-fg-muted">{date(p.date)}</time>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{p.title}</h1>
      <div className="mt-8 space-y-5 text-lg leading-relaxed text-fg/90">
        {p.body.map((para) => <p key={para}>{para}</p>)}
      </div>
    </article>
  );
}
