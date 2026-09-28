import { Body, Controller, Delete, Get, HttpCode, Module, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentActor, MasterAdminOnly, type Actor } from '../../common/decorators';
import { AuditService } from '../audit/audit.service';
import { AuditQuery } from '../audit/audit.module';
import { ServicesModule } from '../services/services.module';
import { UsersModule } from '../users/users.module';
import { AdminService } from './admin.service';
import {
  AdminUserQuery, CompanyDto, CompanyQuery, OnboardingDto, PlanDto, ReorderPlansDto, SubscriptionDto, UpdateCompanyDto, UpdatePlanDto, UserStatusDto,
} from './dto';
import { IdParam, type Id } from '../../common/ids';

@ApiTags('admin')
@ApiBearerAuth()
@MasterAdminOnly()
@Controller('admin')
class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly audit: AuditService,
  ) {}

  @Get('dashboard')
  dashboard() {
    return this.admin.dashboard();
  }

  @Get('companies')
  companies(@Query() q: CompanyQuery) {
    return this.admin.listCompanies(q);
  }

  @Post('companies')
  createCompany(@Body() dto: CompanyDto, @CurrentActor() a: Actor) {
    return this.admin.createCompany(dto, a);
  }

  @Get('companies/:id')
  company(@IdParam() id: Id) {
    return this.admin.getCompany(id);
  }

  @Patch('companies/:id')
  updateCompany(@IdParam() id: Id, @Body() dto: UpdateCompanyDto, @CurrentActor() a: Actor) {
    return this.admin.updateCompany(id, dto, a);
  }

  @Post('companies/:id/activate')
  @HttpCode(200)
  activate(@IdParam() id: Id, @CurrentActor() a: Actor) {
    return this.admin.setStatus(id, 'ACTIVE', a);
  }

  @Post('companies/:id/deactivate')
  @HttpCode(200)
  deactivate(@IdParam() id: Id, @CurrentActor() a: Actor) {
    return this.admin.setStatus(id, 'INACTIVE', a);
  }

  @Patch('companies/:id/subscription')
  subscription(@IdParam() id: Id, @Body() dto: SubscriptionDto, @CurrentActor() a: Actor) {
    return this.admin.setSubscription(id, dto, a);
  }

  @Post('onboarding')
  onboard(@Body() dto: OnboardingDto, @CurrentActor() a: Actor) {
    return this.admin.onboard(dto, a);
  }

  @Get('plans')
  plans() {
    return this.admin.listPlans();
  }

  @Post('plans')
  createPlan(@Body() dto: PlanDto, @CurrentActor() a: Actor) {
    return this.admin.createPlan(dto, a);
  }

  @Put('plans/order')
  reorderPlans(@Body() dto: ReorderPlansDto, @CurrentActor() a: Actor) {
    return this.admin.reorderPlans(dto, a);
  }

  @Patch('plans/:id')
  updatePlan(@IdParam() id: Id, @Body() dto: UpdatePlanDto, @CurrentActor() a: Actor) {
    return this.admin.updatePlan(id, dto, a);
  }

  @Post('plans/:id/activate')
  @HttpCode(200)
  activatePlan(@IdParam() id: Id, @CurrentActor() a: Actor) {
    return this.admin.setPlanActive(id, true, a);
  }

  @Post('plans/:id/deactivate')
  @HttpCode(200)
  deactivatePlan(@IdParam() id: Id, @CurrentActor() a: Actor) {
    return this.admin.setPlanActive(id, false, a);
  }

  @Delete('plans/:id')
  @HttpCode(204)
  deletePlan(@IdParam() id: Id, @CurrentActor() a: Actor) {
    return this.admin.deletePlan(id, a);
  }

  @Get('users')
  users(@Query() q: AdminUserQuery) {
    return this.admin.listUsers(q);
  }

  @Patch('users/:id/status')
  userStatus(@IdParam() id: Id, @Body() dto: UserStatusDto, @CurrentActor() a: Actor) {
    return this.admin.setUserStatus(id, dto.status, a);
  }

  @Get('audit-logs')
  auditLogs(@Query() q: AuditQuery) {
    return this.audit.list(q);
  }
}

@Module({ imports: [ServicesModule, UsersModule], controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}
