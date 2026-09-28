import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { assertFeature } from '../../common/plan-limits';
import { PrismaService } from '../../infra/prisma.service';
import type { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { renderInvoiceHtml } from '../pdf/invoice-html';
import { RenderDataService } from '../pdf/render-data.service';
import { asJson, defaultTemplateConfig, sectionImageKeys, templateConfigSchema, type TemplateConfig } from './template-config.schema';
import type { Id } from '../../common/ids';

@Injectable()
export class InvoiceTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly renderData: RenderDataService,
    private readonly notifications: NotificationsService,
  ) {}

  list(t: TenantContext, serviceId?: Id) {
    const scope = t.serviceScope('template.view');
    return this.prisma.invoiceTemplate.findMany({
      where: { companyId: t.companyId, archivedAt: null, serviceId: serviceId ? { in: scope.filter((s) => s === serviceId) } : { in: scope } },
      include: { service: { select: { name: true, defaultTemplateId: true } }, versions: { select: { id: true, version: true, status: true, publishedAt: true, createdAt: true }, orderBy: { version: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(t: TenantContext, id: Id, perm: 'template.view' | 'template.manage' | 'template.publish' = 'template.view') {
    const tpl = await this.prisma.invoiceTemplate.findFirst({
      where: { id, companyId: t.companyId, archivedAt: null, serviceId: { in: t.allowedServiceIds } },
      include: { versions: { orderBy: { version: 'desc' } }, service: { select: { name: true, defaultTemplateId: true } } },
    });
    if (!tpl) throw new NotFoundException('Template not found');
    t.assertService(perm, tpl.serviceId);
    return tpl;
  }

  async create(t: TenantContext, serviceId: Id, name: string, config?: unknown) {
    t.assertService('template.manage', serviceId);
    await assertFeature(this.prisma, t.companyId, 'customTemplates');
    const cfg = config ? await this.parseOwned(t, serviceId, config) : defaultTemplateConfig();
    const tpl = await this.prisma.invoiceTemplate.create({
      data: { companyId: t.companyId, serviceId, name, versions: { create: { companyId: t.companyId, version: 1, config: asJson(cfg), createdById: t.userId } } },
    });
    await this.audit.log({ actor: t.actor, companyId: t.companyId, serviceId, action: 'TEMPLATE_CREATED', entityType: 'invoice_template', entityId: tpl.id, newValue: { name } });
    return this.get(t, tpl.id);
  }

  /** Copies the latest version into a new draft template of the same service. */
  async duplicate(t: TenantContext, id: Id, name?: string) {
    const src = await this.get(t, id, 'template.manage');
    await assertFeature(this.prisma, t.companyId, 'customTemplates');
    const config = src.versions[0]?.config ?? asJson(defaultTemplateConfig());
    const tpl = await this.prisma.invoiceTemplate.create({
      data: {
        companyId: t.companyId, serviceId: src.serviceId, name: name ?? `${src.name} (copy)`.slice(0, 80),
        versions: { create: { companyId: t.companyId, version: 1, config, createdById: t.userId } },
      },
    });
    await this.audit.log({ actor: t.actor, companyId: t.companyId, serviceId: src.serviceId, action: 'TEMPLATE_DUPLICATED', entityType: 'invoice_template', entityId: tpl.id, newValue: { duplicatedFrom: id } });
    return this.get(t, tpl.id);
  }

  /** Saves a draft: overwrites the latest version while it is DRAFT, otherwise creates version N+1. */
  async saveDraft(t: TenantContext, id: Id, config: unknown, name?: string) {
    const tpl = await this.get(t, id, 'template.manage');
    await assertFeature(this.prisma, t.companyId, 'customTemplates');
    const cfg = await this.parseOwned(t, tpl.serviceId, config);
    const latest = tpl.versions[0];
    const version = latest?.status === 'DRAFT'
      ? await this.prisma.invoiceTemplateVersion.update({ where: { id: latest.id }, data: { config: asJson(cfg) } })
      : await this.prisma.invoiceTemplateVersion.create({ data: { templateId: id, companyId: t.companyId, version: (latest?.version ?? 0) + 1, config: asJson(cfg), createdById: t.userId } });
    if (name) await this.prisma.invoiceTemplate.update({ where: { id }, data: { name } });
    await this.audit.log({ actor: t.actor, companyId: t.companyId, serviceId: tpl.serviceId, action: 'TEMPLATE_UPDATED', entityType: 'invoice_template', entityId: id, newValue: { version: version.version, name } });
    return version;
  }

  /** Publishes the latest draft. Issued invoices keep pointing at the version they were issued with. */
  async publish(t: TenantContext, id: Id, makeDefault = false) {
    const tpl = await this.get(t, id, 'template.publish');
    const latest = tpl.versions[0];
    if (!latest || latest.status !== 'DRAFT') throw new ConflictException('There are no unpublished changes to publish');
    const v = await this.prisma.$transaction(async (tx) => {
      const published = await tx.invoiceTemplateVersion.update({ where: { id: latest.id }, data: { status: 'PUBLISHED', publishedAt: new Date() } });
      if (makeDefault || !tpl.service.defaultTemplateId) await tx.service.update({ where: { id: tpl.serviceId }, data: { defaultTemplateId: id } });
      await this.audit.log({ actor: t.actor, companyId: t.companyId, serviceId: tpl.serviceId, action: 'TEMPLATE_PUBLISHED', entityType: 'invoice_template', entityId: id, newValue: { version: latest.version, makeDefault } }, tx);
      return published;
    });
    await this.notifications.notifyPermission('template.manage', {
      companyId: t.companyId, serviceId: tpl.serviceId, type: 'TEMPLATE_PUBLISHED',
      title: `Template published · ${tpl.name}`, body: `Version ${latest.version} for ${tpl.service.name}`, link: `/app/templates/${id}`,
    }, t.userId);
    return v;
  }

  async setDefault(t: TenantContext, id: Id) {
    const tpl = await this.get(t, id, 'template.publish');
    if (!tpl.versions.some((v) => v.status === 'PUBLISHED')) throw new ConflictException('Publish this template before making it the default');
    await this.prisma.service.update({ where: { id: tpl.serviceId }, data: { defaultTemplateId: id } });
    await this.audit.log({ actor: t.actor, companyId: t.companyId, serviceId: tpl.serviceId, action: 'TEMPLATE_DEFAULT_SET', entityType: 'invoice_template', entityId: id, previousValue: { defaultTemplateId: tpl.service.defaultTemplateId } });
    return this.get(t, id);
  }

  /** Templates used by any invoice (even cancelled or void ones) are archived so those PDFs re-render identically. */
  async remove(t: TenantContext, id: Id) {
    const tpl = await this.get(t, id, 'template.manage');
    if (tpl.service.defaultTemplateId === id) throw new ConflictException('This is the default template. Make another template the default before deleting it');
    const used = await this.prisma.invoice.count({ where: { templateVersion: { templateId: id } } });
    if (used) await this.prisma.invoiceTemplate.update({ where: { id }, data: { archivedAt: new Date() } });
    else await this.prisma.invoiceTemplate.delete({ where: { id } });
    await this.audit.log({ actor: t.actor, companyId: t.companyId, serviceId: tpl.serviceId, action: 'TEMPLATE_DELETED', entityType: 'invoice_template', entityId: id, previousValue: { name: tpl.name }, newValue: used ? { archived: true, usedByInvoices: used } : undefined });
  }

  async preview(t: TenantContext, id: Id, config?: unknown) {
    const tpl = await this.get(t, id);
    const cfg = config ? parse(config) : parse(tpl.versions[0]?.config ?? defaultTemplateConfig());
    return renderInvoiceHtml(await this.renderData.sample(tpl.serviceId, t.companyId, cfg));
  }

  /** Validates the config and that every custom image is a document uploaded to this company. */
  private async parseOwned(t: TenantContext, serviceId: Id, config: unknown) {
    const cfg = parse(config);
    const keys = sectionImageKeys(cfg);
    if (keys.length) {
      const owned = await this.prisma.document.count({ where: { companyId: t.companyId, storageKey: { in: keys }, OR: [{ serviceId }, { serviceId: null }] } });
      if (owned !== keys.length) throw new BadRequestException('An image in this template is not available. Upload it again from the image picker');
    }
    return cfg;
  }
}

function parse(config: unknown): TemplateConfig {
  const r = templateConfigSchema.safeParse(config);
  if (!r.success) throw new BadRequestException(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return r.data;
}
