import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Actor } from '../../common/decorators';
import { assertLimit } from '../../common/plan-limits';
import { slugify } from '../../common/slug';
import { PrismaService } from '../../infra/prisma.service';
import type { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from '../audit/audit.service';
import { createDefaultTemplate, type ThemeColors } from '../invoice-templates/default-template';
import { codeFromName, previewNumbers, validateNumbering } from '../invoices/numbering';
import { CreateServiceDto, UpdateServiceDto } from './dto';
import type { Id } from '../../common/ids';

const ASSET_KEYS = ['logoKey', 'headerLogoKey', 'footerLogoKey', 'signatureKey'] as const;

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Used by the service API, onboarding and signup (inside their transaction). */
  async createInTx(tx: Prisma.TransactionClient, companyId: Id, dto: CreateServiceDto, actor: Actor, colors?: ThemeColors) {
    await assertLimit(tx, companyId, 'maxServices');
    const { numbering, code, ...rest } = dto;
    const service = await tx.service.create({
      data: {
        ...rest, companyId, displayName: dto.displayName ?? dto.name,
        slug: await this.uniqueSlug(tx, companyId, dto.name),
        code: code ? await this.assertCodeFree(tx, companyId, code) : await this.uniqueCode(tx, companyId, dto.name),
        numbering: numbering ? validateNumbering({}, numbering) : {},
      },
    });
    await createDefaultTemplate(tx, companyId, service.id, actor.userId, colors);
    await this.audit.log({ actor, companyId, serviceId: service.id, action: 'SERVICE_CREATED', entityType: 'service', entityId: service.id, newValue: dto }, tx);
    return service;
  }

  create(t: TenantContext, dto: CreateServiceDto) {
    return this.prisma.$transaction((tx) => this.createInTx(tx, t.companyId, dto, t.actor));
  }

  list(t: TenantContext) {
    return this.prisma.service.findMany({
      where: { companyId: t.companyId, id: { in: t.serviceScope('service.view') } },
      orderBy: { name: 'asc' },
    });
  }

  async get(t: TenantContext, id: Id) {
    t.assertService('service.view', id);
    const s = await this.prisma.service.findFirst({ where: { id, companyId: t.companyId } });
    if (!s) throw new NotFoundException('Service not found');
    return s;
  }

  async update(t: TenantContext, id: Id, dto: UpdateServiceDto) {
    t.assertService('service.update', id);
    const before = await this.get(t, id);
    for (const k of ASSET_KEYS) {
      if (dto[k] && !dto[k]!.startsWith(`companies/${t.companyId}/services/${id}/`)) throw new BadRequestException(`Invalid ${k}`);
    }
    if (dto.defaultTemplateId) {
      const tpl = await this.prisma.invoiceTemplate.findFirst({ where: { id: dto.defaultTemplateId, serviceId: id, companyId: t.companyId, archivedAt: null } });
      if (!tpl) throw new BadRequestException('Template does not belong to this service');
    }
    const { numbering, code, ...rest } = dto;
    const after = await this.prisma.$transaction(async (tx) => {
      if (code && code !== before.code) {
        const issued = await tx.invoice.count({ where: { serviceId: id, invoiceNumber: { not: null } } });
        if (issued) throw new ConflictException('The service code is locked once documents have been issued');
        await this.assertCodeFree(tx, t.companyId, code);
      }
      return tx.service.update({
        where: { id: before.id },
        data: { ...rest, code, numbering: numbering ? validateNumbering(before.numbering, numbering) : undefined },
      });
    });
    await this.audit.log({ actor: t.actor, companyId: t.companyId, serviceId: id, action: 'SERVICE_UPDATED', entityType: 'service', entityId: id, previousValue: before, newValue: dto });
    return after;
  }

  /** Next number per document series. Pass a draft `numbering` to preview unsaved changes. */
  async previewNumbering(t: TenantContext, id: Id, numbering?: Record<string, unknown>) {
    const s = await this.get(t, id);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: t.companyId }, select: { timezone: true } });
    const svc = { id: s.id, code: s.code, numbering: s.numbering };
    return previewNumbers(this.prisma, svc, company.timezone, validateNumbering(s.numbering, numbering ?? {}));
  }

  /** Services with invoices are deactivated, never hard-deleted. */
  async remove(t: TenantContext, id: Id) {
    t.assertService('service.delete', id);
    await this.get(t, id);
    await this.prisma.service.update({ where: { id }, data: { status: 'INACTIVE' } });
    await this.audit.log({ actor: t.actor, companyId: t.companyId, serviceId: id, action: 'SERVICE_DELETED', entityType: 'service', entityId: id });
  }

  private async assertCodeFree(tx: Prisma.TransactionClient, companyId: Id, code: string) {
    if (await tx.service.findUnique({ where: { companyId_code: { companyId, code } } })) {
      throw new ConflictException(`Service code ${code} is already used by another service`);
    }
    return code;
  }

  private async uniqueCode(tx: Prisma.TransactionClient, companyId: Id, name: string) {
    const base = codeFromName(name);
    for (let i = 1; ; i++) {
      const code = i === 1 ? base : `${base.slice(0, 6)}${i}`;
      if (!(await tx.service.findUnique({ where: { companyId_code: { companyId, code } } }))) return code;
    }
  }

  private async uniqueSlug(tx: Prisma.TransactionClient, companyId: Id, name: string) {
    const base = slugify(name);
    for (let i = 0; ; i++) {
      const slug = i ? `${base}-${i + 1}` : base;
      if (!(await tx.service.findUnique({ where: { companyId_slug: { companyId, slug } } }))) return slug;
    }
  }
}
