import { Controller, Get, Global, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, MaxLength } from 'class-validator';
import { RequirePermission, Tenant } from '../../common/decorators';
import { PageQuery } from '../../common/pagination';
import type { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from './audit.service';
import { IsId, type Id } from '../../common/ids';

export class AuditQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(60)
  action?: string;

  @IsOptional() @IsString() @MaxLength(60)
  entityType?: string;

  @IsOptional() @IsId()
  actorUserId?: Id;

  /** Master admin only; tenant routes always use the X-Company-Id company. */
  @IsOptional() @IsId()
  companyId?: Id;

  @IsOptional() @Type(() => Date) @IsDate()
  from?: Date;

  @IsOptional() @Type(() => Date) @IsDate()
  to?: Date;
}

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit-logs')
class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermission('audit.view')
  list(@Tenant() t: TenantContext, @Query() q: AuditQuery) {
    return this.audit.list(q, t.companyId);
  }
}

@Global()
@Module({ controllers: [AuditController], providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
