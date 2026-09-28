import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean, IsDate, IsEmail, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max,
  MaxLength, Min,
} from 'class-validator';
import { IsId, type Id } from '../../common/ids';

const GSTIN = /^[0-9A-Z]{15}$/;
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const MONEY = /^\d{1,16}(\.\d{1,2})?$/;
const RATE = /^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/;

class PartyBase {
  @IsString() @MaxLength(200) name: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @Matches(GSTIN, { message: 'Invalid GSTIN' }) gstin?: string;
  @IsOptional() @Matches(PAN, { message: 'Invalid PAN' }) pan?: string;
  /** Used for GST place of supply (intra vs inter state). */
  @IsOptional() @IsString() @MaxLength(60) state?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
}

export class CustomerDto extends PartyBase {
  @IsOptional() @IsString() @MaxLength(1000) billingAddress?: string;
  @IsOptional() @IsString() @MaxLength(1000) shippingAddress?: string;
}
export class UpdateCustomerDto extends PartialType(CustomerDto) {}

export class VendorDto extends PartyBase {
  @IsOptional() @IsString() @MaxLength(1000) address?: string;
  @IsOptional() @IsObject() bankDetails?: Record<string, string>;
  @IsOptional() @IsInt() @Min(0) @Max(365) paymentTermsDays?: number;
}
export class UpdateVendorDto extends PartialType(VendorDto) {}

export class ProductDto {
  @IsString() @MaxLength(200) name: string;
  @IsOptional() @IsId() serviceId?: Id;
  @IsOptional() @IsString() @MaxLength(60) sku?: string;
  @IsOptional() @IsString() @MaxLength(20) hsnSac?: string;
  @IsOptional() @IsString() @MaxLength(20) unit?: string;
  /** Decimal string, e.g. "1500.00" */
  @Matches(MONEY, { message: 'Enter a price of 0 or more with up to 2 decimals' }) unitPrice: string;
  @IsOptional() @Matches(RATE, { message: 'Tax rate must be between 0 and 100' }) taxRate?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateProductDto extends PartialType(ProductDto) {}

export class DepartmentDto {
  @IsString() @MaxLength(120) name: string;
  @IsOptional() @IsId() serviceId?: Id;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}
export class UpdateDepartmentDto extends PartialType(DepartmentDto) {}

export class EmployeeDto {
  @IsString() @MaxLength(120) fullName: string;
  @IsOptional() @IsId() serviceId?: Id;
  @IsOptional() @IsId() departmentId?: Id;
  @IsOptional() @IsString() @MaxLength(30) employeeCode?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(80) designation?: string;
  @IsOptional() @Type(() => Date) @IsDate() joiningDate?: Date;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
}
export class UpdateEmployeeDto extends PartialType(EmployeeDto) {}
