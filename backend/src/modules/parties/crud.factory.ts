import {
  Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException,
  Patch, Post, Query, Type, ValidationPipe, BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { RequirePermission, Tenant } from '../../common/decorators';
import { dateRange, orderBy, pageArgs, RecordQuery, toPage } from '../../common/pagination';
import type { Permission } from '../../common/permissions';
import { assertLimit, type CountLimit } from '../../common/plan-limits';
import { PrismaService } from '../../infra/prisma.service';
import type { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from '../audit/audit.service';
import { IdParam, type Id } from '../../common/ids';

type Resource = 'customer' | 'vendor' | 'product' | 'employee' | 'department';
type Filter = 'status' | 'isActive' | 'departmentId' | 'createdAt';

export interface CrudConfig {
  path: string;
  resource: Resource;
  label: string;
  createDto: Type<object>;
  updateDto: Type<object>;
  searchFields: string[];
  sortFields: string[];
  filters?: Filter[];
  /** Model has an optional serviceId: records are visible company-wide (null) or to users of that service. */
  serviceScoped?: boolean;
  /** Foreign keys to other tenant-owned records, verified to belong to the same company. */
  refs?: Record<string, Resource>;
  /** Plan limit checked on create. */
  limit?: CountLimit;
}

type Row = { id: Id; serviceId?: Id | null } & Record<string, unknown>;
/** The subset of a Prisma model delegate the factory uses; the concrete model is chosen at runtime. */
interface Delegate {
  findMany(args: object): Promise<Row[]>;
  findFirst(args: object): Promise<Row | null>;
  count(args: object): Promise<number>;
  create(args: object): Promise<Row>;
  update(args: object): Promise<Row>;
  delete(args: object): Promise<Row>;
}
const delegate = (db: Prisma.TransactionClient, model: Resource) => (db as unknown as Record<Resource, Delegate>)[model];

const pipe = (expectedType: Type<object>) =>
  new ValidationPipe({ expectedType, whitelist: true, forbidNonWhitelisted: true, transform: true });

/**
 * Generates a tenant-scoped REST controller (list/get/create/update/delete) for simple company-owned records.
 * companyId always comes from the TenantContext, never from the body. For service-scoped models every
 * read and write is also limited to services where the user holds the permission.
 */
export function crudController(cfg: CrudConfig): Type<unknown> {
  const perm = (a: string) => `${cfg.resource}.${a}` as Permission;
  const has = (f: Filter) => cfg.filters?.includes(f);

  @ApiTags(cfg.path)
  @ApiBearerAuth()
  @Controller(cfg.path)
  class CrudController {
    constructor(
      readonly prisma: PrismaService,
      readonly audit: AuditService,
    ) {}

    repo(db: Prisma.TransactionClient = this.prisma) {
      return delegate(db, cfg.resource);
    }

    /** Company scope plus, for service-scoped models, "company-wide or a service where the user holds `p`". */
    scope(t: TenantContext, p: Permission) {
      return {
        companyId: t.companyId,
        ...(cfg.serviceScoped && { OR: [{ serviceId: null }, { serviceId: { in: t.serviceScope(p) } }] }),
      };
    }

    @Get()
    @RequirePermission(perm('view'))
    async list(@Tenant() t: TenantContext, @Query() q: RecordQuery) {
      if (q.serviceId && cfg.serviceScoped) t.assertService(perm('view'), q.serviceId);
      const where = {
        ...this.scope(t, perm('view')),
        AND: [
          has('status') && q.status && { status: q.status },
          has('isActive') && q.isActive !== undefined && { isActive: q.isActive },
          has('departmentId') && q.departmentId && { departmentId: q.departmentId },
          has('createdAt') && dateRange(q.from, q.to) && { createdAt: dateRange(q.from, q.to) },
          // "Available to this service": its own records plus company-wide ones.
          cfg.serviceScoped && q.serviceId && { OR: [{ serviceId: null }, { serviceId: q.serviceId }] },
          q.search && { OR: cfg.searchFields.map((f) => ({ [f]: { contains: q.search, mode: 'insensitive' } })) },
        ].filter(Boolean),
      };
      const [data, total] = await Promise.all([
        this.repo().findMany({ where, ...pageArgs(q), orderBy: orderBy(q, cfg.sortFields) }),
        this.repo().count({ where }),
      ]);
      return toPage(data, total, q);
    }

    @Get(':id')
    @RequirePermission(perm('view'))
    get(@Tenant() t: TenantContext, @IdParam() id: Id) {
      return this.find(t, id, perm('view'));
    }

    async find(t: TenantContext, id: Id, p: Permission) {
      const row = await this.repo().findFirst({ where: { id, ...this.scope(t, p) } });
      if (!row) throw new NotFoundException(`The requested ${cfg.label} could not be found`);
      return row;
    }

    @Post()
    @RequirePermission(perm('create'))
    @ApiBody({ type: cfg.createDto })
    async create(@Tenant() t: TenantContext, @Body(pipe(cfg.createDto)) dto: Record<string, unknown>) {
      await this.checkRefs(t, dto, perm('create'));
      return this.prisma.$transaction(async (tx) => {
        if (cfg.limit) await assertLimit(tx, t.companyId, cfg.limit);
        const row = await this.repo(tx).create({ data: { ...dto, companyId: t.companyId } });
        await this.audit.log({ actor: t.actor, companyId: t.companyId, serviceId: row.serviceId, action: 'RECORD_CREATED', entityType: cfg.resource, entityId: row.id, newValue: dto }, tx);
        return row;
      });
    }

    @Patch(':id')
    @RequirePermission(perm('update'))
    @ApiBody({ type: cfg.updateDto })
    async update(@Tenant() t: TenantContext, @IdParam() id: Id, @Body(pipe(cfg.updateDto)) dto: Record<string, unknown>) {
      const before = await this.find(t, id, perm('update'));
      await this.checkRefs(t, dto, perm('update'));
      const row = await this.repo().update({ where: { id }, data: dto });
      await this.audit.log({ actor: t.actor, companyId: t.companyId, serviceId: row.serviceId, action: 'RECORD_UPDATED', entityType: cfg.resource, entityId: id, previousValue: before, newValue: dto });
      return row;
    }

    @Delete(':id')
    @HttpCode(204)
    @RequirePermission(perm('delete'))
    async remove(@Tenant() t: TenantContext, @IdParam() id: Id) {
      const before = await this.find(t, id, perm('delete'));
      try {
        await this.repo().delete({ where: { id } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
          throw new ConflictException(`This ${cfg.label} is used by other records. Mark it inactive instead.`);
        }
        throw e;
      }
      await this.audit.log({ actor: t.actor, companyId: t.companyId, serviceId: before.serviceId, action: 'RECORD_DELETED', entityType: cfg.resource, entityId: id, previousValue: before });
    }

    async checkRefs(t: TenantContext, dto: Record<string, unknown>, p: Permission) {
      const sid = dto.serviceId as Id | undefined;
      if (cfg.serviceScoped && sid) t.assertService(p, sid);
      for (const [field, model] of Object.entries(cfg.refs ?? {})) {
        const id = dto[field] as Id | undefined;
        const found = id && (await delegate(this.prisma, model).findFirst({ where: { id, companyId: t.companyId }, select: { id: true } }));
        if (id && !found) {
          throw new BadRequestException(`The selected ${field.replace(/Id$/, '')} could not be found`);
        }
      }
    }
  }

  Object.defineProperty(CrudController, 'name', { value: `${cfg.resource[0].toUpperCase()}${cfg.resource.slice(1)}Controller` });
  return CrudController;
}
