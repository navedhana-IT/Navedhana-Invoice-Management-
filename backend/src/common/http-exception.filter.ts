import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

const CODES: Record<number, string> = {
  400: 'BAD_REQUEST', 401: 'UNAUTHENTICATED', 402: 'SUBSCRIPTION_REQUIRED', 403: 'FORBIDDEN', 404: 'NOT_FOUND',
  409: 'CONFLICT', 413: 'PAYLOAD_TOO_LARGE', 415: 'UNSUPPORTED_MEDIA_TYPE', 422: 'UNPROCESSABLE', 429: 'RATE_LIMITED',
  500: 'INTERNAL', 503: 'UNAVAILABLE',
};

const FRIENDLY: Record<number, string> = {
  401: 'Please sign in to continue',
  403: "You don't have permission to do that",
  404: "We couldn't find what you were looking for",
  429: 'Too many requests. Please wait a moment and try again',
};

interface Body { statusCode: number; code: string; message: string; errors?: string[] }

/**
 * Single error envelope for every failure: { statusCode, code, message, errors?, requestId }.
 * Internals (stack traces, SQL, Prisma codes) are logged with the request id, never returned.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(e: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: string }>();
    const res = ctx.getResponse<Response>();
    const body = this.toBody(e);
    if (body.statusCode >= 500) {
      this.logger.error({ requestId: req.id, method: req.method, path: req.originalUrl, error: e instanceof Error ? e.stack ?? e.message : String(e) });
    }
    if (res.headersSent) return;
    res.status(body.statusCode).json({ ...body, requestId: req.id });
  }

  private toBody(e: unknown): Body {
    if (e instanceof HttpException) {
      const statusCode = e.getStatus();
      const r = e.getResponse();
      const raw = typeof r === 'string' ? r : (r as { message?: unknown }).message;
      const code = (typeof r === 'object' && typeof (r as { code?: unknown }).code === 'string' && (r as { code: string }).code) || CODES[statusCode] || 'ERROR';
      if (Array.isArray(raw)) {
        const errors = raw.map(String);
        return { statusCode, code: 'VALIDATION_FAILED', message: errors[0] ?? 'Please check the highlighted fields', errors };
      }
      const msg = typeof raw === 'string' ? raw : '';
      const generic = !msg || msg === e.name || /^(Forbidden|Unauthorized|Not Found|ThrottlerException.*|Forbidden resource)$/i.test(msg);
      return { statusCode, code, message: generic ? FRIENDLY[statusCode] ?? msg ?? 'Request failed' : msg };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) return prismaBody(e);
    if (e instanceof Prisma.PrismaClientValidationError) return { statusCode: 400, code: 'BAD_REQUEST', message: 'Some of the submitted values are invalid' };
    if (e instanceof Prisma.PrismaClientInitializationError) return { statusCode: 503, code: 'UNAVAILABLE', message: 'The service is temporarily unavailable. Please try again shortly' };
    if (typeof e === 'object' && e && (e as { type?: string }).type === 'entity.too.large') return { statusCode: 413, code: 'PAYLOAD_TOO_LARGE', message: 'The request is too large' };
    if (typeof e === 'object' && e && (e as { type?: string }).type === 'entity.parse.failed') return { statusCode: 400, code: 'BAD_REQUEST', message: 'The request body is not valid JSON' };
    return { statusCode: 500, code: 'INTERNAL', message: 'Something went wrong on our side. Please try again' };
  }
}

function prismaBody(e: Prisma.PrismaClientKnownRequestError): Body {
  const target = (e.meta?.target as string[] | string | undefined) ?? '';
  const fields = (Array.isArray(target) ? target : [target]).filter((f) => f && f !== 'companyId' && f !== 'company_id');
  switch (e.code) {
    case 'P2002':
      return { statusCode: 409, code: 'DUPLICATE', message: fields.length ? `A record with this ${fields.join(' and ')} already exists` : 'A record with these values already exists' };
    case 'P2025':
    case 'P2001':
      return { statusCode: 404, code: 'NOT_FOUND', message: "We couldn't find that record. It may have been deleted" };
    case 'P2003':
    case 'P2014':
      return { statusCode: 409, code: 'IN_USE', message: 'This record is linked to other records and cannot be changed or removed' };
    case 'P2000':
      return { statusCode: 400, code: 'BAD_REQUEST', message: 'One of the values is too long' };
    case 'P2005':
    case 'P2006':
    case 'P2007':
    case 'P2023':
      return { statusCode: 400, code: 'BAD_REQUEST', message: 'Some of the submitted values are invalid' };
    case 'P2024':
    case 'P2034':
      return { statusCode: 503, code: 'RETRY', message: 'The system is busy. Please try again' };
    default:
      return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, code: 'INTERNAL', message: 'Something went wrong on our side. Please try again' };
  }
}
