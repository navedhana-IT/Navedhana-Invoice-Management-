import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Id } from './ids';
import type { Permission } from './permissions';
import type { TenantContext } from '../tenancy/tenant-context';

export const IS_PUBLIC = 'isPublic';
export const MASTER_ADMIN = 'masterAdmin';
export const PERMISSION = 'permission';

/** Skip JWT auth. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Platform-level route, requires isMasterAdmin. */
export const MasterAdminOnly = () => SetMetadata(MASTER_ADMIN, true);
/** Tenant route: requires X-Company-Id membership + this permission. */
export const RequirePermission = (p: Permission) => SetMetadata(PERMISSION, p);
/** Tenant route that only needs an active membership (no specific permission). */
export const TenantMember = () => SetMetadata(PERMISSION, '*');
export const READ_ONLY = 'readOnly';
/** POST route that doesn't change data (previews), so it stays available when a trial has lapsed. */
export const ReadOnlyRoute = () => SetMetadata(READ_ONLY, true);

export interface Actor {
  userId: Id;
  isMasterAdmin: boolean;
  ip?: string;
  userAgent?: string;
}

export interface AuthedRequest extends Request {
  actor?: Actor;
  tenant?: TenantContext;
}

export const CurrentActor = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().actor!,
);

export const Tenant = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().tenant!,
);
