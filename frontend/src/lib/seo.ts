import type { Metadata } from 'next';
import type { Id } from '@/lib/ids';

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? 'nbills';
export const SITE_DESCRIPTION = 'GST-ready invoicing, payment schedules, receipts and reporting for companies that run multiple brands and services. A Navedhana Product.';
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'hello@navedhana.com';
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'support@navedhana.com';
const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export function pageMeta(title: string, description: string, path: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, siteName: SITE_NAME, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

/**
 * Server-side fetch of public NestJS endpoints with ISR caching. Returns null when the API is unreachable/404.
 * `tags` let the backend purge the cache on change via /api/revalidate.
 */
export async function publicApi<T>(path: string, revalidate = 300, tags?: string[]): Promise<T | null> {
  try {
    const r = await fetch(`${API_URL}/api/v1/public${path}`, { next: { revalidate, tags } });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

export type PublicPlan = {
  id: Id; code: string; name: string; description: string | null; price: string; currency: string; interval: 'MONTHLY' | 'YEARLY';
  trialDays: number; features: string[]; limits: Record<string, number | boolean | null>; highlighted: boolean;
};

export const getPlans = () => publicApi<PublicPlan[]>('/plans', 3600, ['plans']);

export const jsonLd = (data: object) => ({ __html: JSON.stringify(data).replace(/</g, '\\u003c') });
