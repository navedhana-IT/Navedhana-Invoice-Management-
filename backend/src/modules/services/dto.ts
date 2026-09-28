import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { IsId, type Id } from '../../common/ids';

export class CreateServiceDto {
  @IsString() @MaxLength(120)
  name: string;

  @IsOptional() @IsString() @MaxLength(120)
  displayName?: string;

  @IsOptional() @IsString() @MaxLength(120)
  tagline?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @IsString() @MaxLength(500)
  address?: string;

  @IsOptional() @IsEmail()
  email?: string;

  @IsOptional() @IsString() @MaxLength(30)
  phone?: string;

  @IsOptional() @IsString() @MaxLength(200)
  website?: string;

  @IsOptional() @Matches(/^[0-9A-Z]{15}$/, { message: 'GSTIN must be 15 uppercase alphanumerics' })
  gstin?: string;

  @IsOptional() @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/, { message: 'Invalid PAN' })
  pan?: string;

  @IsOptional() @IsString() @MaxLength(60)
  state?: string;

  /** { accountName, accountNumber, ifsc, bankName, branch, upiId } */
  @IsOptional() @IsObject()
  bankDetails?: Record<string, string>;

  @IsOptional() @IsObject()
  socialLinks?: Record<string, string>;

  /** Short code used in document numbers, e.g. LSP. Generated from the name when omitted. */
  @IsOptional() @Matches(/^[A-Z0-9]{2,8}$/, { message: 'Code must be 2-8 uppercase letters or digits' })
  code?: string;

  /** Per-series numbering overrides, e.g. { INVOICE: { format: '{CODE}/{FY}/{SEQ}', padding: 5 } }. Validated in the service. */
  @IsOptional() @IsObject()
  numbering?: Record<string, unknown>;

  @IsOptional() @IsString() @MaxLength(5000)
  terms?: string;

  @IsOptional() @IsBoolean()
  isPublic?: boolean;
}

export class NumberingPreviewDto {
  @IsOptional() @IsObject()
  numbering?: Record<string, unknown>;
}

export class UpdateServiceDto extends PartialType(CreateServiceDto) {
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @IsOptional() @IsId()
  defaultTemplateId?: Id;

  /** Storage keys returned by POST /documents/upload */
  @IsOptional() @IsString() logoKey?: string;
  @IsOptional() @IsString() headerLogoKey?: string;
  @IsOptional() @IsString() footerLogoKey?: string;
  @IsOptional() @IsString() signatureKey?: string;
}
