import {
  Body, Controller, Delete, Get, Header, HttpCode, Injectable, Module, NotFoundException, Patch, Post, Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, PartialType } from '@nestjs/swagger';
import { CustomFieldType } from '@prisma/client';
import { IsArray, IsBoolean, IsEnum, IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ReadOnlyRoute, RequirePermission, Tenant } from '../../common/decorators';
import { PrismaService } from '../../infra/prisma.service';
import type { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from '../audit/audit.service';
import { PdfModule } from '../pdf/pdf.module';
import { InvoiceTemplatesService } from './invoice-templates.service';
import { IdParam, IdQuery, IsId, type Id } from '../../common/ids';

class CreateTemplateDto {
  @IsId() serviceId: Id;
  @IsString() @MaxLength(80) name: string;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}
class SaveVersionDto {
  @IsObject() config: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(80) name?: string;
}
class PublishDto {
  @IsOptional() @IsBoolean() makeDefault?: boolean;
}
class DefaultTemplateDto {
  @IsId() templateId: Id;
}
class DuplicateDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
}
class PreviewDto {
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}
class CustomFieldDto {
  @IsId() serviceId: Id;
  @Matches(/^[a-z][a-z0-9_]{1,39}$/, { message: 'key: lowercase letters, digits, underscore' }) key: string;
  @IsString() @MaxLength(80) label: string;
  @IsEnum(CustomFieldType) type: CustomFieldType;
  @IsOptional() @IsArray() @IsString({ each: true }) options?: string[];
  @IsOptional() @IsBoolean() required?: boolean;
}
class UpdateCustomFieldDto extends PartialType(CustomFieldDto) {}

@Injectable()
class CustomFieldsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  list(t: TenantContext, serviceId?: Id) {
    const scope = t.serviceScope('template.view');
    return this.prisma.customFieldDefinition.findMany({ where: { companyId: t.companyId, serviceId: { in: serviceId ? scope.filter((s) => s === serviceId) : scope } }, orderBy: { createdAt: 'asc' } });
  }

  async create(t: TenantContext, dto: CustomFieldDto) {
    t.assertService('template.manage', dto.serviceId);
    const f = await this.prisma.customFieldDefinition.create({ data: { ...dto, companyId: t.companyId } });
    await this.audit.log({ actor: t.actor, companyId: t.companyId, serviceId: dto.serviceId, action: 'RECORD_CREATED', entityType: 'custom_field', entityId: f.id, newValue: dto });
    return f;
  }

  async update(t: TenantContext, id: Id, dto: UpdateCustomFieldDto) {
    const f = await this.owned(t, id);
    const { serviceId: _ignored, ...data } = dto;
    const updated = await this.prisma.customFieldDefinition.update({ where: { id: f.id }, data });
    await this.audit.log({ actor: t.actor, companyId: t.companyId, serviceId: f.serviceId, action: 'RECORD_UPDATED', entityType: 'custom_field', entityId: id, previousValue: f, newValue: data });
    return updated;
  }

  async remove(t: TenantContext, id: Id) {
    const f = await this.owned(t, id);
    await this.prisma.customFieldDefinition.delete({ where: { id } });
    await this.audit.log({ actor: t.actor, companyId: t.companyId, serviceId: f.serviceId, action: 'RECORD_DELETED', entityType: 'custom_field', entityId: id, previousValue: f });
  }

  private async owned(t: TenantContext, id: Id) {
    const f = await this.prisma.customFieldDefinition.findFirst({ where: { id, companyId: t.companyId, serviceId: { in: t.allowedServiceIds } } });
    if (!f) throw new NotFoundException('Custom field not found');
    t.assertService('template.manage', f.serviceId);
    return f;
  }
}

@ApiTags('invoice-templates')
@ApiBearerAuth()
@Controller()
class InvoiceTemplatesController {
  constructor(private readonly templates: InvoiceTemplatesService, private readonly fields: CustomFieldsService) {}

  @Get('invoice-templates')
  @RequirePermission('template.view')
  list(@Tenant() t: TenantContext, @IdQuery('serviceId') serviceId?: Id) {
    return this.templates.list(t, serviceId);
  }

  @Post('invoice-templates')
  @RequirePermission('template.manage')
  create(@Tenant() t: TenantContext, @Body() dto: CreateTemplateDto) {
    return this.templates.create(t, dto.serviceId, dto.name, dto.config);
  }

  @Get('invoice-templates/:id')
  @RequirePermission('template.view')
  get(@Tenant() t: TenantContext, @IdParam() id: Id) {
    return this.templates.get(t, id);
  }

  @Post('invoice-templates/:id/versions')
  @RequirePermission('template.manage')
  save(@Tenant() t: TenantContext, @IdParam() id: Id, @Body() dto: SaveVersionDto) {
    return this.templates.saveDraft(t, id, dto.config, dto.name);
  }

  @Post('invoice-templates/:id/publish')
  @HttpCode(200)
  @RequirePermission('template.publish')
  publish(@Tenant() t: TenantContext, @IdParam() id: Id, @Body() dto: PublishDto) {
    return this.templates.publish(t, id, dto.makeDefault);
  }

  @Post('invoice-templates/:id/duplicate')
  @RequirePermission('template.manage')
  duplicate(@Tenant() t: TenantContext, @IdParam() id: Id, @Body() dto: DuplicateDto) {
    return this.templates.duplicate(t, id, dto.name);
  }

  @Put('services/:id/default-template')
  @RequirePermission('template.publish')
  async setDefault(@Tenant() t: TenantContext, @IdParam() serviceId: Id, @Body() dto: DefaultTemplateDto) {
    const tpl = await this.templates.get(t, dto.templateId, 'template.publish');
    if (tpl.serviceId !== serviceId) throw new NotFoundException('Template not found');
    return this.templates.setDefault(t, dto.templateId);
  }

  @Delete('invoice-templates/:id')
  @HttpCode(204)
  @RequirePermission('template.manage')
  remove(@Tenant() t: TenantContext, @IdParam() id: Id) {
    return this.templates.remove(t, id);
  }

  @Post('invoice-templates/:id/preview')
  @ReadOnlyRoute()
  @HttpCode(200)
  @Header('Content-Type', 'text/html; charset=utf-8')
  @RequirePermission('template.view')
  preview(@Tenant() t: TenantContext, @IdParam() id: Id, @Body() dto: PreviewDto) {
    return this.templates.preview(t, id, dto.config);
  }

  @Get('custom-fields')
  @RequirePermission('template.view')
  listFields(@Tenant() t: TenantContext, @IdQuery('serviceId') serviceId?: Id) {
    return this.fields.list(t, serviceId);
  }

  @Post('custom-fields')
  @RequirePermission('template.manage')
  createField(@Tenant() t: TenantContext, @Body() dto: CustomFieldDto) {
    return this.fields.create(t, dto);
  }

  @Patch('custom-fields/:id')
  @RequirePermission('template.manage')
  updateField(@Tenant() t: TenantContext, @IdParam() id: Id, @Body() dto: UpdateCustomFieldDto) {
    return this.fields.update(t, id, dto);
  }

  @Delete('custom-fields/:id')
  @HttpCode(204)
  @RequirePermission('template.manage')
  removeField(@Tenant() t: TenantContext, @IdParam() id: Id) {
    return this.fields.remove(t, id);
  }
}

@Module({ imports: [PdfModule], controllers: [InvoiceTemplatesController], providers: [InvoiceTemplatesService, CustomFieldsService] })
export class InvoiceTemplatesModule {}
