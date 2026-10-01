import Link from 'next/link';
import { posts } from '@/content/site';
import { pageMeta } from '@/lib/seo';
import { date } from '@/lib/utils';

export const metadata = pageMeta('Blog', 'Guides on GST invoicing, payment collection and running multiple brands.', '/blog');

export default function BlogPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Blog</h1>
      <p className="mt-3 text-fg-muted">Practical guides from the nbills team.</p>
      <div className="mt-12 divide-y">
        {posts.map((p) => (
          <article key={p.slug} className="py-8">
            <time className="text-sm text-fg-muted">{date(p.date)}</time>
            <h2 className="mt-2 text-xl font-semibold"><Link href={`/blog/${p.slug}`} className="hover:text-primary">{p.title}</Link></h2>
            <p className="mt-2 text-fg-muted">{p.excerpt}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
