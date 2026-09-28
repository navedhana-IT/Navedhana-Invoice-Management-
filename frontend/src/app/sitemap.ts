import type { MetadataRoute } from 'next';
import { posts } from '@/content/site';
import { publicApi, SITE_URL } from '@/lib/seo';

export const revalidate = 900;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const brands = (await publicApi<{ path: string; updatedAt: string }[]>('/sitemap', 900)) ?? [];
  return [
    ...['', '/features', '/pricing', '/signup', '/blog', '/contact'].map((p) => ({ url: `${SITE_URL}${p}`, changeFrequency: 'weekly' as const, priority: p ? 0.7 : 1 })),
    ...posts.map((p) => ({ url: `${SITE_URL}/blog/${p.slug}`, lastModified: p.date })),
    ...brands.map((b) => ({ url: `${SITE_URL}${b.path}`, lastModified: b.updatedAt })),
  ];
}
