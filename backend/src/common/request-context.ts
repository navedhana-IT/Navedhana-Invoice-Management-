import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const logger = new Logger('HTTP');
const VALID_ID = /^[\w.-]{8,64}$/;

/** Assigns X-Request-Id (trusting a well-formed upstream id) and logs one line per request. */
export function requestContext(req: Request & { id?: string }, res: Response, next: NextFunction) {
  const incoming = req.header('x-request-id');
  req.id = incoming && VALID_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    if (req.originalUrl.endsWith('/health')) return;
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const line = { requestId: req.id, method: req.method, path: req.originalUrl.split('?')[0], status: res.statusCode, ms: Math.round(ms) };
    if (res.statusCode >= 500) logger.error(line);
    else if (res.statusCode >= 400 || ms > 1000) logger.warn(line);
    else logger.log(line);
  });
  next();
}
