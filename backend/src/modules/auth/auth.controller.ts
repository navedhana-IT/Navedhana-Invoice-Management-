import { Body, Controller, Get, HttpCode, Patch, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PASSWORD, PASSWORD_MESSAGE } from '../../common/password';
import type { Request, Response } from 'express';
import { env } from '../../config/env';
import { CurrentActor, Public, Tenant, TenantMember, type Actor } from '../../common/decorators';
import type { TenantContext } from '../../tenancy/tenant-context';
import { AuthService, type Session } from './auth.service';

class LoginDto {
  @IsEmail({}, { message: 'Enter a valid email address' })
  email: string;

  @IsString() @MinLength(1, { message: 'Enter your password' }) @MaxLength(128)
  password: string;
}

class ForgotDto {
  @IsEmail({}, { message: 'Enter a valid email address' })
  email: string;
}

class ResetDto {
  @IsString() @MinLength(20) @MaxLength(100)
  token: string;

  @Matches(PASSWORD, { message: PASSWORD_MESSAGE })
  password: string;
}

class ChangePasswordDto {
  @IsString() @MinLength(1, { message: 'Enter your current password' }) @MaxLength(128)
  currentPassword: string;

  @Matches(PASSWORD, { message: PASSWORD_MESSAGE })
  newPassword: string;
}

class ProfileDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120)
  fullName?: string;

  @IsOptional() @IsString() @MaxLength(30)
  phone?: string;

  @IsOptional() @IsBoolean()
  emailNotifications?: boolean;
}

const COOKIE = 'rt';
const COOKIE_PATH = '/api/v1/auth';
/** Non-secret "signed in" flag on `/` so the Next.js middleware can redirect; the refresh token stays path-scoped. */
const FLAG = 'nv_session';

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('auth/login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const s = await this.auth.login(dto.email, dto.password, meta(req));
    return this.respond(res, s);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('auth/refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const s = await this.auth.refresh(req.cookies?.[COOKIE], meta(req));
    return this.respond(res, s);
  }

  @Public()
  @Post('auth/logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[COOKIE]);
    res.clearCookie(COOKIE, { path: COOKIE_PATH });
    res.clearCookie(FLAG, { path: '/' });
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('auth/forgot-password')
  @HttpCode(200)
  async forgot(@Body() dto: ForgotDto, @Req() req: Request) {
    await this.auth.forgotPassword(dto.email, meta(req));
    return { message: 'If an account exists for that email, a reset link is on its way' };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('auth/reset-password')
  @HttpCode(200)
  async reset(@Body() dto: ResetDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, await this.auth.resetPassword(dto.token, dto.password, meta(req)));
  }

  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('auth/change-password')
  @HttpCode(200)
  async changePassword(@CurrentActor() a: Actor, @Body() dto: ChangePasswordDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, await this.auth.changePassword(a.userId, dto.currentPassword, dto.newPassword, meta(req)));
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentActor() a: Actor) {
    return this.auth.me(a.userId);
  }

  @ApiBearerAuth()
  @Patch('me')
  updateMe(@CurrentActor() a: Actor, @Body() dto: ProfileDto) {
    return this.auth.updateProfile(a.userId, dto);
  }

  /** Permissions/services for the X-Company-Id (and optional X-Service-Id). UI hints only. */
  @ApiBearerAuth()
  @TenantMember()
  @Get('me/context')
  context(@Tenant() t: TenantContext) {
    return this.auth.context(t);
  }

  private respond(res: Response, s: Session) {
    return setSessionCookies(res, s);
  }
}

export function setSessionCookies(res: Response, s: Session) {
  const base = { httpOnly: true, secure: env().NODE_ENV === 'production', sameSite: 'lax' as const, expires: s.refreshExpiresAt };
  res.cookie(COOKIE, s.refreshToken, { ...base, path: COOKIE_PATH });
  res.cookie(FLAG, '1', { ...base, path: '/' });
  return { accessToken: s.accessToken };
}

export const meta = (req: Request) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });
