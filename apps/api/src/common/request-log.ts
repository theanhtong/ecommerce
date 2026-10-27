import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

const logger = new Logger('HTTP');

// Tags every request with an id (the proxy's, if it sent one) and logs one line when it finishes.
export function requestLog(req: Request, res: Response, next: NextFunction) {
  const header = req.headers['x-request-id'];
  const id =
    typeof header === 'string' && /^[\w-]{1,64}$/.test(header)
      ? header
      : randomUUID();
  res.setHeader('X-Request-Id', id);
  const start = performance.now();
  res.on('finish', () => {
    if (process.env.NODE_ENV === 'test') return;
    logger.log({
      requestId: id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ms: Math.round(performance.now() - start),
      ip: req.ip,
    });
  });
  next();
}
