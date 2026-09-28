import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PlanInterval, SubscriptionStatus } from '@prisma/client';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDate, IsEmail, IsEnum, IsIn, IsInt, IsObject, IsOptional, IsString, IsTimeZone, Matches,
  Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { PageQuery } from '../../common/pagination';
import { CreateServiceDto } from '../services/dto';
import { IsId, type Id } from '../../common/ids';

export class CompanyDto {
  @IsString() @MaxLength(200)
  legalName: string;

  @IsString() @MaxLength(120)
  displayName: string;

  @IsOptional() @IsString() @MaxLength(60)
  registrationNumber?: string;

  @IsOptional() @Matches(/^[0-9A-Z]{15}$/, { message: 'GSTIN must be 15 uppercase alphanumerics' })
  gstin?: string;

  @IsOptional() @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/, { message: 'Invalid PAN' })
  pan?: string;

  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(80) state?: string;
  @IsOptional() @IsString() @MaxLength(80) country?: string;
  @IsOptional() @IsString() @MaxLength(12) pincode?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(200) website?: string;
  @IsOptional() @IsTimeZone() timezone?: string;

  @IsOptional() @IsId()
  planId?: Id;
}

export class UpdateCompanyDto extends PartialType(CompanyDto) {}

export class AdminUserDto {
  @IsString() @MaxLength(120)
  fullName: string;

  @IsEmail()
  email: string;

  @IsOptional() @IsString() @MinLength(8) @MaxLength(128)
  password?: string;
}

/** Master Admin onboarding wizard payload (steps 1-7) executed atomically. */
export class OnboardingDto {
  @ValidateNested() @Type(() => CompanyDto)
  company: CompanyDto;

  @ValidateNested() @Type(() => AdminUserDto)
  admin: AdminUserDto;

  @IsArray() @ValidateNested({ each: true }) @Type(() => CreateServiceDto) @ArrayMaxSize(50)
  services: CreateServiceDto[];

  @IsOptional() @IsBoolean()
  activate?: boolean;
}

export class CompanyQuery extends PageQuery {
  @IsOptional() @IsIn(['PENDING', 'ACTIVE', 'INACTIVE'])
  status?: 'PENDING' | 'ACTIVE' | 'INACTIVE';

  @IsOptional() @IsId()
  planId?: Id;

  @IsOptional() @IsEnum(SubscriptionStatus)
  subscriptionStatus?: SubscriptionStatus;
}

export class PlanDto {
  @Matches(/^[A-Z][A-Z0-9_]{1,29}$/, { message: 'Code must be 2-30 uppercase letters, digits or underscores' })
  code: string;

  @IsString() @MinLength(2) @MaxLength(60)
  name: string;

  @IsOptional() @IsString() @MaxLength(300)
  description?: string;

  @Matches(/^\d{1,12}(\.\d{1,2})?$/, { message: 'Price must be 0 or more with up to 2 decimals' })
  price: string;

  @IsOptional() @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @IsOptional() @IsEnum(PlanInterval)
  interval?: PlanInterval;

  @IsOptional() @IsInt() @Min(0) @Max(365)
  trialDays?: number;

  @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(120, { each: true })
  features: string[];

  /** { maxServices, maxUsers, maxEmployees, maxCustomers, maxVendors, maxInvoicesPerMonth, storageMb (null = unlimited), customTemplates, reports, apiAccess } */
  @IsObject()
  limits: Record<string, unknown>;

  @IsOptional() @IsInt() @Min(0)
  displayOrder?: number;

  @IsOptional() @IsBoolean()
  highlighted?: boolean;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class UpdatePlanDto extends PartialType(PlanDto) {}

export class ReorderPlansDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsId({ each: true })
  ids: Id[];
}

export class SubscriptionDto {
  @IsOptional() @IsEnum(SubscriptionStatus)
  subscriptionStatus?: SubscriptionStatus;

  @IsOptional() @Type(() => Date) @IsDate()
  trialEndsAt?: Date;

  @IsOptional() @IsId()
  planId?: Id;
}

export class AdminUserQuery extends PageQuery {
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}

export class UserStatusDto {
  @IsIn(['ACTIVE', 'INACTIVE'])
  status: 'ACTIVE' | 'INACTIVE';
}
