import { Controller, Get, Header, Module, NotFoundException, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators';
import { PrismaService } from '../../infra/prisma.service';
import { StorageService } from '../../infra/storage.service';

/** Read-only, unauthenticated data for the SEO pages. Exposes only fields a service explicitly marked public. */
@ApiTags('public')
@Public()
@Throttle({ default: { limit: 120, ttl: 60_000 } })
@Controller('public')
class PublicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Get('plans')
  @Header('Cache-Control', 'public, max-age=60')
  plans() {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, description: true, price: true, currency: true, interval: true, trialDays: true, features: true, limits: true, highlighted: true },
      orderBy: [{ displayOrder: 'asc' }, { price: 'asc' }],
    });
  }

  @Get('brands/:companySlug/:serviceSlug')
  @Header('Cache-Control', 'public, max-age=300')
  async brand(@Param('companySlug') companySlug: string, @Param('serviceSlug') serviceSlug: string) {
    const s = await this.prisma.service.findFirst({
      where: { slug: serviceSlug, isPublic: true, status: 'ACTIVE', company: { slug: companySlug, status: 'ACTIVE' } },
      select: { name: true, displayName: true, tagline: true, description: true, email: true, phone: true, website: true, address: true, state: true, logoKey: true, socialLinks: true, company: { select: { legalName: true, displayName: true } } },
    });
    if (!s) throw new NotFoundException();
    const { logoKey, ...rest } = s;
    return { ...rest, logoUrl: logoKey ? await this.storage.signedUrl(logoKey, 3600) : null };
  }

  /** Public brand URLs for sitemap.xml. */
  @Get('sitemap')
  @Header('Cache-Control', 'public, max-age=900')
  async sitemap() {
    const rows = await this.prisma.service.findMany({
      where: { isPublic: true, status: 'ACTIVE', company: { status: 'ACTIVE' } },
      select: { slug: true, updatedAt: true, company: { select: { slug: true } } },
      take: 5000,
    });
    return rows.map((r) => ({ path: `/b/${r.company.slug}/${r.slug}`, updatedAt: r.updatedAt }));
  }
}

@Module({ controllers: [PublicController] })
export class PublicModule {}
