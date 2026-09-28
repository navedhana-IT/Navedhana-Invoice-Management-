import { PartialType } from '@nestjs/swagger';
import { RecordQuery } from '../../common/pagination';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { IsId, type Id } from '../../common/ids';

export class RoleAssignmentDto {
  @IsId()
  roleId: Id;

  /** Bind the role to one service; omit for company-wide. */
  @IsOptional() @IsId()
  serviceId?: Id;
}

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString() @MaxLength(120)
  fullName: string;

  /** Required only when the email does not exist yet. */
  @IsOptional() @IsString() @MinLength(8) @MaxLength(128)
  password?: string;

  @IsOptional() @IsString() @MaxLength(30)
  phone?: string;

  @IsArray() @ValidateNested({ each: true }) @Type(() => RoleAssignmentDto) @ArrayMaxSize(20)
  roles: RoleAssignmentDto[];

  @IsOptional() @IsArray() @IsId({ each: true })
  serviceIds?: Id[];
}

export class UpdateUserDto {
  @IsOptional() @IsString() @MaxLength(120)
  fullName?: string;

  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => RoleAssignmentDto)
  roles?: RoleAssignmentDto[];

  @IsOptional() @IsArray() @IsId({ each: true })
  serviceIds?: Id[];
}

export class CreateRoleDto {
  @IsString() @MaxLength(80)
  name: string;

  @IsOptional() @IsString() @MaxLength(300)
  description?: string;

  @IsOptional() @IsBoolean()
  allServices?: boolean;

  @IsArray() @IsString({ each: true })
  permissions: string[];
}

export class UpdateRoleDto extends PartialType(CreateRoleDto) {}

export class UserQuery extends RecordQuery {
  @IsOptional() @IsId()
  roleId?: Id;
}
