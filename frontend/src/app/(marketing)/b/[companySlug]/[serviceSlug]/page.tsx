import { Globe, Mail, MapPin, Phone } from 'lucide-react';
import { notFound } from 'next/navigation';
import { jsonLd, pageMeta, publicApi } from '@/lib/seo';

export const revalidate = 300;

type Brand = {
  name: string; displayName: string | null; tagline: string | null; description: string | null; email: string | null; phone: string | null; website: string | null;
  address: string | null; state: string | null; logoUrl: string | null; socialLinks: Record<string, string> | null;
  company: { legalName: string; displayName: string };
};
type Props = { params: Promise<{ companySlug: string; serviceSlug: string }> };

const load = async (p: Props['params']) => {
  const { companySlug, serviceSlug } = await p;
  return { brand: await publicApi<Brand>(`/brands/${encodeURIComponent(companySlug)}/${encodeURIComponent(serviceSlug)}`), path: `/b/${companySlug}/${serviceSlug}` };
};

export async function generateMetadata({ params }: Props) {
  const { brand, path } = await load(params);
  if (!brand) return {};
  const name = brand.displayName ?? brand.name;
  return pageMeta(name, brand.description ?? brand.tagline ?? name, path);
}

export default async function BrandPage({ params }: Props) {
  const { brand } = await load(params);
  if (!brand) notFound();
  const name = brand.displayName ?? brand.name;
  const contacts = [
    { icon: Mail, value: brand.email, href: brand.email && `mailto:${brand.email}` },
    { icon: Phone, value: brand.phone, href: brand.phone && `tel:${brand.phone}` },
    { icon: Globe, value: brand.website, href: /^https?:\/\//i.test(brand.website ?? '') ? brand.website : null },
    { icon: MapPin, value: [brand.address, brand.state].filter(Boolean).join(', ') || null, href: null },
  ].filter((c) => c.value);

  return (
    <div className="mx-auto max-w-4xl px-6 py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd({
          '@context': 'https://schema.org', '@type': 'Organization', name, url: brand.website ?? undefined, email: brand.email ?? undefined,
          telephone: brand.phone ?? undefined, logo: brand.logoUrl ?? undefined, parentOrganization: { '@type': 'Organization', name: brand.company.legalName },
          sameAs: Object.values(brand.socialLinks ?? {}).filter((u) => /^https?:\/\//i.test(u)),
        })}
      />
      <div className="flex items-center gap-5">
        {brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, host not known at build time
          <img src={brand.logoUrl} alt={`${name} logo`} className="size-20 rounded-2xl border bg-white object-contain p-2" />
        ) : (
          <div className="grid size-20 place-items-center rounded-2xl bg-gradient-to-br from-[#fd8904] to-[#fe5003] text-3xl font-semibold text-white">{name[0]}</div>
        )}
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{name}</h1>
          {brand.tagline && <p className="text-fg-muted">{brand.tagline}</p>}
        </div>
      </div>
      {brand.description && <p className="mt-10 whitespace-pre-line text-lg leading-relaxed">{brand.description}</p>}
      {contacts.length > 0 && (
        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {contacts.map(({ icon: Icon, value, href }) => (
            <div key={value} className="flex items-center gap-3 rounded-xl border bg-bg p-4 text-sm">
              <Icon className="size-4 text-primary" />
              {href ? <a href={href} className="hover:text-primary" rel="noopener">{value}</a> : <span>{value}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
