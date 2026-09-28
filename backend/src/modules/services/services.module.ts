import { Body, Controller, Delete, Get, HttpCode, Module, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReadOnlyRoute, RequirePermission, Tenant } from '../../common/decorators';
import type { TenantContext } from '../../tenancy/tenant-context';
import { CreateServiceDto, NumberingPreviewDto, UpdateServiceDto } from './dto';
import { ServicesService } from './services.service';
import { IdParam, type Id } from '../../common/ids';

@ApiTags('services')
@ApiBearerAuth()
@Controller('services')
class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  @RequirePermission('service.view')
  list(@Tenant() t: TenantContext) {
    return this.services.list(t);
  }

  @Post()
  @RequirePermission('service.create')
  create(@Tenant() t: TenantContext, @Body() dto: CreateServiceDto) {
    return this.services.create(t, dto);
  }

  @Get(':id')
  @RequirePermission('service.view')
  get(@Tenant() t: TenantContext, @IdParam() id: Id) {
    return this.services.get(t, id);
  }

  @Patch(':id')
  @RequirePermission('service.update')
  update(@Tenant() t: TenantContext, @IdParam() id: Id, @Body() dto: UpdateServiceDto) {
    return this.services.update(t, id, dto);
  }

  @Post(':id/numbering/preview')
  @ReadOnlyRoute()
  @HttpCode(200)
  @RequirePermission('service.view')
  previewNumbering(@Tenant() t: TenantContext, @IdParam() id: Id, @Body() body: NumberingPreviewDto) {
    return this.services.previewNumbering(t, id, body.numbering);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('service.delete')
  remove(@Tenant() t: TenantContext, @IdParam() id: Id) {
    return this.services.remove(t, id);
  }
}

@Module({ controllers: [ServicesController], providers: [ServicesService], exports: [ServicesService] })
export class ServicesModule {}
