import {
  BadRequestException, Body, ConflictException, Controller, HttpCode, Injectable, Logger, Module, Post, Req, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { plainToInstance, Type } from 'class-transformer';
import { Equals, IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength, validate, ValidateNested } from 'class-validator';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { Public } from '../../common/decorators';
import { PASSWORD, PASSWORD_MESSAGE } from '../../common/password';
import { slugify } from '../../common/slug';
import { checkUpload, uploadLimits } from '../../common/uploads';
import { PrismaService } from '../../infra/prisma.service';
import { StorageService } from '../../infra/storage.service';
import { CompanyDto } from '../admin/dto';
import { AuditService } from '../audit/audit.service';
import { meta, setSessionCookies } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { CreateServiceDto } from '../services/dto';
import { ServicesModule } from '../services/services.module';
import { ServicesService } from '../services/services.service';
import { IsId, type Id } from '../../common/ids';

class SignupAccountDto {
  @IsString() @MinLength(2) @MaxLength(120) fullName: string;
  @IsEmail({}, { message: 'Enter a valid email address' }) @MaxLength(200) email: string;
  @Matches(PASSWORD, { message: PASSWORD_MESSAGE }) password: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
}

class SignupCompanyDto extends CompanyDto {}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Colours for the first brand's default invoice template. */
class SignupThemeDto {
  @IsOptional() @Matches(HEX, { message: 'Choose a valid primary colour' }) primaryColor?: string;
  @IsOptional() @Matches(HEX, { message: 'Choose a valid accent colour' }) accentColor?: string;
}

export class SignupDto {
  @ValidateNested() @Type(() => SignupAccountDto) account: SignupAccountDto;
  @ValidateNested() @Type(() => SignupCompanyDto) company: SignupCompanyDto;
  @ValidateNested() @Type(() => CreateServiceDto) service: CreateServiceDto;
  @IsOptional() @ValidateNested() @Type(() => SignupThemeDto) theme?: SignupThemeDto;
  @IsId({ message: 'Choose a plan' }) planId: Id;
  @Equals(true, { message: 'Please accept the terms to continue' }) acceptTerms: boolean;
}

class CheckEmailDto {
  @IsEmail({}, { message: 'Enter a valid email address' }) email: string;
}

@Injectable()
class SignupService {
  private readonly logger = new Logger('Signup');

  constructor(
    private readonly prisma: PrismaService,
    private readonly services: ServicesService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async emailTaken(email: string) {
    return !!(await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() }, select: { id: true } }));
  }

  /** User + company (trial) + Company Admin membership + first service with default template, atomically. */
  async register(dto: SignupDto, logo?: Express.Multer.File) {
    const email = dto.account.email.toLowerCase().trim();
    const logoExt = logo ? checkUpload(logo, true) : undefined;
    if (await this.emailTaken(email)) throw new ConflictException({ code: 'EMAIL_TAKEN', message: 'An account with this email already exists. Sign in instead' });
    const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
    if (!plan || !plan.isActive) throw new BadRequestException({ code: 'PLAN_UNAVAILABLE', message: 'That plan is no longer available. Please choose another' });
    const slug = slugify(dto.company.displayName);
    if (!slug) throw new BadRequestException({ code: 'COMPANY_NAME_INVALID', message: 'Enter a company name with letters or numbers' });
    if (await this.prisma.company.findUnique({ where: { slug } })) {
      throw new ConflictException({ code: 'COMPANY_TAKEN', message: 'A company with this name is already registered. Try your legal or brand name' });
    }

    const { user, company, service } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, fullName: dto.account.fullName, phone: dto.account.phone, passwordHash: await AuthService.hashPassword(dto.account.password) } });
      const actor = { userId: user.id, isMasterAdmin: false };
      const { planId: _p, ...companyData } = dto.company;
      const company = await tx.company.create({
        data: {
          ...companyData, slug, status: 'ACTIVE', planId: plan.id,
          subscriptionStatus: plan.trialDays > 0 ? 'TRIALING' : 'ACTIVE',
          trialEndsAt: plan.trialDays > 0 ? new Date(Date.now() + plan.trialDays * 86_400_000) : null,
        },
      });
      const adminRole = await tx.role.findFirstOrThrow({ where: { companyId: null, key: 'company_admin' } });
      await tx.membership.create({ data: { companyId: company.id, userId: user.id, roles: { create: { roleId: adminRole.id } } } });
      const service = await this.services.createInTx(tx, company.id, dto.service, actor, dto.theme);
      await this.audit.log({ actor, companyId: company.id, action: 'USER_CREATED', entityType: 'user', entityId: user.id, newValue: { email } }, tx);
      await this.audit.log({ actor, companyId: company.id, action: 'COMPANY_REGISTERED', entityType: 'company', entityId: company.id, newValue: { displayName: company.displayName, plan: plan.code } }, tx);
      return { user, company, service };
    }, { timeout: 20_000 });

    // The logo is optional polish: a storage hiccup must not fail an otherwise complete signup.
    if (logo && logoExt) {
      try {
        const key = this.storage.key(company.id, 'logos', `${randomUUID()}.${logoExt}`, service.id);
        await this.storage.put(key, logo.buffer, logo.mimetype);
        await this.prisma.document.create({ data: { companyId: company.id, serviceId: service.id, kind: 'LOGO', storageKey: key, fileName: logo.originalname.slice(0, 200), mimeType: logo.mimetype, size: logo.size, createdById: user.id } });
        await this.prisma.service.update({ where: { id: service.id }, data: { logoKey: key } });
      } catch (e) {
        this.logger.warn(`Logo upload failed for company ${company.id}: ${(e as Error).message}`);
      }
    }
    return { userId: user.id, companyId: company.id, serviceId: service.id };
  }
}

@ApiTags('auth')
@Public()
@Controller('auth/signup')
class SignupController {
  constructor(private readonly signup: SignupService, private readonly auth: AuthService) {}

  /** JSON body, or multipart with the JSON in `payload` and an optional `logo` image. */
  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiConsumes('multipart/form-data', 'application/json')
  @UseInterceptors(FileInterceptor('logo', { storage: memoryStorage(), limits: uploadLimits() }))
  async register(@Body() body: Record<string, unknown>, @UploadedFile() logo: Express.Multer.File | undefined, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const dto = await parseSignup(body);
    const created = await this.signup.register(dto, logo);
    const session = await this.auth.startSession(created.userId, meta(req));
    return { ...setSessionCookies(res, session), companyId: created.companyId, serviceId: created.serviceId };
  }

  @Post('check-email')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async checkEmail(@Body() dto: CheckEmailDto) {
    return { available: !(await this.signup.emailTaken(dto.email)) };
  }
}

async function parseSignup(body: Record<string, unknown>) {
  let raw: unknown = body;
  if (typeof body.payload === 'string') {
    try {
      raw = JSON.parse(body.payload);
    } catch {
      throw new BadRequestException('The signup form could not be read. Please try again');
    }
  }
  const dto = plainToInstance(SignupDto, raw);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length) {
    const messages = errors.flatMap(function flat(e): string[] {
      return [...Object.values(e.constraints ?? {}), ...(e.children ?? []).flatMap(flat)];
    });
    throw new BadRequestException(messages);
  }
  return dto;
}

@Module({ imports: [ServicesModule], controllers: [SignupController], providers: [SignupService] })
export class SignupModule {}
