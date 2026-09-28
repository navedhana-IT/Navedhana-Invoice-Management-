import { Body, Controller, Get, Injectable, Module, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, OmitType } from '@nestjs/swagger';
import { RequirePermission, Tenant } from '../../common/decorators';
import { PrismaService } from '../../infra/prisma.service';
import type { TenantContext } from '../../tenancy/tenant-context';
import { UpdateCompanyDto } from '../admin/dto';
import { AuditService } from '../audit/audit.service';

/** Company admins edit their own profile; plan and status stay Master Admin only. */
class UpdateOwnCompanyDto extends OmitType(UpdateCompanyDto, ['planId'] as const) {}

@Injectable()
class CompanyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  get(t: TenantContext) {
    return this.prisma.company.findUniqueOrThrow({ where: { id: t.companyId }, include: { plan: true } });
  }

  async update(t: TenantContext, dto: UpdateOwnCompanyDto) {
    const before = await this.get(t);
    const after = await this.prisma.company.update({ where: { id: t.companyId }, data: dto });
    await this.audit.log({ actor: t.actor, companyId: t.companyId, action: 'COMPANY_UPDATED', entityType: 'company', entityId: t.companyId, previousValue: before, newValue: dto });
    return after;
  }
}

@ApiTags('company')
@ApiBearerAuth()
@Controller('company')
class CompanyController {
  constructor(private readonly company: CompanyService) {}

  @Get()
  @RequirePermission('company.view')
  get(@Tenant() t: TenantContext) {
    return this.company.get(t);
  }

  @Patch()
  @RequirePermission('company.update')
  update(@Tenant() t: TenantContext, @Body() dto: UpdateOwnCompanyDto) {
    return this.company.update(t, dto);
  }
}

@Module({ controllers: [CompanyController], providers: [CompanyService] })
export class CompanyModule {}
