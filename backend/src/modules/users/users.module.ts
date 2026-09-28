import { Body, Controller, Delete, Get, HttpCode, Module, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission, Tenant } from '../../common/decorators';
import { UserQuery as PageQuery } from './dto';
import { ALL_PERMISSIONS } from '../../common/permissions';
import type { TenantContext } from '../../tenancy/tenant-context';
import { CreateRoleDto, CreateUserDto, UpdateRoleDto, UpdateUserDto } from './dto';
import { RolesService } from './roles.service';
import { UsersService } from './users.service';
import { IdParam, type Id } from '../../common/ids';

@ApiTags('users')
@ApiBearerAuth()
@Controller()
class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly roles: RolesService,
  ) {}

  @Get('users')
  @RequirePermission('user.view')
  list(@Tenant() t: TenantContext, @Query() q: PageQuery) {
    return this.users.list(t, q);
  }

  @Post('users')
  @RequirePermission('user.create')
  create(@Tenant() t: TenantContext, @Body() dto: CreateUserDto) {
    return this.users.create(t, dto);
  }

  /** :id is the membership id. */
  @Patch('users/:id')
  @RequirePermission('user.update')
  update(@Tenant() t: TenantContext, @IdParam() id: Id, @Body() dto: UpdateUserDto) {
    return this.users.update(t, id, dto);
  }

  @Get('roles')
  @RequirePermission('role.view')
  listRoles(@Tenant() t: TenantContext) {
    return this.roles.list(t);
  }

  @Post('roles')
  @RequirePermission('role.create')
  createRole(@Tenant() t: TenantContext, @Body() dto: CreateRoleDto) {
    return this.roles.create(t, dto);
  }

  @Patch('roles/:id')
  @RequirePermission('role.update')
  updateRole(@Tenant() t: TenantContext, @IdParam() id: Id, @Body() dto: UpdateRoleDto) {
    return this.roles.update(t, id, dto);
  }

  @Delete('roles/:id')
  @HttpCode(204)
  @RequirePermission('role.delete')
  removeRole(@Tenant() t: TenantContext, @IdParam() id: Id) {
    return this.roles.remove(t, id);
  }

  @Get('permissions')
  @RequirePermission('role.view')
  permissions() {
    return ALL_PERMISSIONS;
  }
}

@Module({ controllers: [UsersController], providers: [UsersService, RolesService], exports: [UsersService] })
export class UsersModule {}
