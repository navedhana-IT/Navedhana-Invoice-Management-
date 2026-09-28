import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDate, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { IsId, type Id } from './ids';

export class PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit = 20;

  /** Alias of limit. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize?: number;

  @IsOptional() @IsString() @MaxLength(100)
  search?: string;

  /** field:asc|desc, e.g. createdAt:desc */
  @IsOptional() @IsString()
  sort?: string;
}

const toBool = ({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value);

export class RecordQuery extends PageQuery {
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @IsOptional() @IsId()
  serviceId?: Id;

  @IsOptional() @IsId()
  departmentId?: Id;

  @IsOptional() @Transform(toBool) @IsBoolean()
  isActive?: boolean;

  /** Created-date range (inclusive). */
  @IsOptional() @Type(() => Date) @IsDate()
  from?: Date;

  @IsOptional() @Type(() => Date) @IsDate()
  to?: Date;
}

export interface Page<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; pages: number };
}

export const pageSize = (q: PageQuery) => q.pageSize ?? q.limit;

export const pageArgs = (q: PageQuery) => ({ skip: (q.page - 1) * pageSize(q), take: pageSize(q) });

export function orderBy(q: PageQuery, allowed: string[], fallback = 'createdAt') {
  const [field, dir] = (q.sort ?? `${fallback}:desc`).split(':');
  return { [allowed.includes(field) ? field : fallback]: dir === 'asc' ? 'asc' : 'desc' } as Record<string, 'asc' | 'desc'>;
}

/** Inclusive date range filter; `to` covers the whole day. */
export function dateRange(from?: Date, to?: Date) {
  if (!from && !to) return undefined;
  return { ...(from && { gte: from }), ...(to && { lt: new Date(to.getTime() + 86_400_000) }) };
}

export const toPage = <T>(data: T[], total: number, q: PageQuery): Page<T> => ({
  data,
  meta: { page: q.page, limit: pageSize(q), total, pages: Math.ceil(total / pageSize(q)) },
});
