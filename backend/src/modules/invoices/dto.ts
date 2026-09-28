import { OmitType, PartialType } from '@nestjs/swagger';
import { InvoiceDirection, InvoiceStatus, InvoiceType, DueType, TaxMode } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsDate, IsEmail, IsEnum, IsIn, IsObject, IsOptional, IsString, Length, Matches, MaxLength, ValidateNested,
} from 'class-validator';
import { PageQuery } from '../../common/pagination';
import { IsId, type Id } from '../../common/ids';

const MONEY = /^\d{1,16}(\.\d{1,2})?$/;

export class SendInvoiceDto {
  /** Defaults to the customer's email. */
  @IsOptional() @IsArray() @ArrayMaxSize(5) @IsEmail({}, { each: true, message: 'Enter valid email addresses' })
  to?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(5) @IsEmail({}, { each: true, message: 'Enter valid CC addresses' })
  cc?: string[];

  @IsOptional() @IsString() @MaxLength(2000)
  message?: string;
}

export class InvoiceItemDto {
  @IsOptional() @IsId() productId?: Id;
  @IsString() @MaxLength(500) description: string;
  @IsOptional() @IsString() @MaxLength(20) hsnSac?: string;
  @Matches(/^\d{1,14}(\.\d{1,4})?$/, { message: 'Quantity must be a positive number with up to 4 decimals' }) quantity: string;
  @Matches(MONEY, { message: 'Unit price must be 0 or more with up to 2 decimals' }) unitPrice: string;
  /** Absolute discount amount for this line. */
  @IsOptional() @Matches(MONEY, { message: 'Discount must be 0 or more with up to 2 decimals' }) discount?: string;
  @IsOptional() @Matches(/^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/, { message: 'Tax rate must be between 0 and 100' }) taxRate?: string;
}

export class ScheduleItemDto {
  @IsOptional() @IsString() @MaxLength(200) description?: string;
  @Matches(MONEY, { message: 'Stage amount must be a number with up to 2 decimals' }) amount: string;
  @IsEnum(DueType) dueType: DueType;
  @IsOptional() @Type(() => Date) @IsDate() dueDate?: Date;
}

export class CreateInvoiceDto {
  @IsId() serviceId: Id;
  @IsEnum(InvoiceType) invoiceType: InvoiceType;
  @IsOptional() @IsId() customerId?: Id;
  @IsOptional() @IsId() vendorId?: Id;
  /** Required for CREDIT_NOTE / DEBIT_NOTE. */
  @IsOptional() @IsId() referenceInvoiceId?: Id;
  /** Vendor's own bill number for PURCHASE invoices. */
  @IsOptional() @IsString() @MaxLength(60) externalNumber?: string;
  @IsOptional() @Type(() => Date) @IsDate() issueDate?: Date;
  @IsOptional() @Type(() => Date) @IsDate() dueDate?: Date;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  /** Auto-detected from service vs party state when omitted. */
  @IsOptional() @IsEnum(TaxMode) taxMode?: TaxMode;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsString() @MaxLength(5000) terms?: string;
  @IsOptional() @IsObject() customFieldValues?: Record<string, unknown>;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];

  @IsOptional() @IsArray() @ArrayMaxSize(24) @ValidateNested({ each: true }) @Type(() => ScheduleItemDto)
  schedule?: ScheduleItemDto[];
}

export class UpdateInvoiceDto extends PartialType(OmitType(CreateInvoiceDto, ['serviceId', 'invoiceType', 'referenceInvoiceId'] as const)) {}

export class ScheduleDto {
  @IsArray() @ArrayMaxSize(24) @ValidateNested({ each: true }) @Type(() => ScheduleItemDto)
  items: ScheduleItemDto[];
}

export class InvoiceQuery extends PageQuery {
  @IsOptional() @IsEnum(InvoiceStatus) status?: InvoiceStatus;
  @IsOptional() @IsEnum(InvoiceType) invoiceType?: InvoiceType;
  @IsOptional() @IsEnum(InvoiceDirection) direction?: InvoiceDirection;
  @IsOptional() @IsId() customerId?: Id;
  @IsOptional() @IsId() vendorId?: Id;
  @IsOptional() @IsId() serviceId?: Id;
  /** Issue-date range. */
  @IsOptional() @Type(() => Date) @IsDate() from?: Date;
  @IsOptional() @Type(() => Date) @IsDate() to?: Date;
  /** Due-date range. */
  @IsOptional() @Type(() => Date) @IsDate() dueFrom?: Date;
  @IsOptional() @Type(() => Date) @IsDate() dueTo?: Date;
  @IsOptional() @Matches(MONEY) minAmount?: string;
  @IsOptional() @Matches(MONEY) maxAmount?: string;
  /** OPEN: balance outstanding; OVERDUE: past due with balance; SETTLED: fully paid. */
  @IsOptional() @IsIn(['OPEN', 'OVERDUE', 'SETTLED']) payment?: 'OPEN' | 'OVERDUE' | 'SETTLED';
}
