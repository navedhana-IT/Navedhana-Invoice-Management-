import { Controller, Get, Module, Param, ParseEnumPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission, Tenant } from '../../common/decorators';
import { assertFeature } from '../../common/plan-limits';
import { PrismaService } from '../../infra/prisma.service';
import type { TenantContext } from '../../tenancy/tenant-context';
import { REPORT_TYPES, ReportQuery, ReportsService, type ReportType } from './reports.service';

const TYPES = Object.fromEntries(REPORT_TYPES.map((t) => [t, t]));

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
class ReportsController {
  constructor(private readonly reports: ReportsService, private readonly prisma: PrismaService) {}

  @Get(':type')
  @RequirePermission('report.view')
  async run(@Tenant() t: TenantContext, @Param('type', new ParseEnumPipe(TYPES)) type: ReportType, @Query() q: ReportQuery) {
    await assertFeature(this.prisma, t.companyId, 'reports');
    return this.reports.run(t, type, q);
  }
}

@Module({ controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
