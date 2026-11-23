import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/apiError';
import { logger } from '../utils/logger';
import { env } from '../config/env';

const SIGNAL_STATUS: Record<string, number> = {
  NOT_FOUND: 404, FORBIDDEN: 403,
  BOOKING_CONFLICT: 409, MAINTENANCE: 409, CLASS_SCHEDULE: 409, CONFLICT: 409, INVALID_STATE: 409,
  EQUIPMENT_UNAVAILABLE: 409, TOO_LATE: 409, BOOKING_EXPIRED: 409,
};

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new ApiError(404, 'ROUTE_NOT_FOUND', `Route ${req.method} ${req.path} does not exist`));
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong on our side. Please try again.';
  let details: unknown;

  const e = err as { sqlState?: string; sqlMessage?: string; errno?: number; code?: string; type?: string; status?: number };

  if (err instanceof ApiError) {
    ({ status, code, message, details } = err);
  } else if (e.sqlState === '45000' && e.sqlMessage) {
    // Business rule raised inside MySQL (stored procedure / trigger via SIGNAL): "CODE: message"
    const m = /^([A-Z_]+):\s*(.*)$/.exec(e.sqlMessage);
    code = m ? m[1] : 'RULE_VIOLATION';
    message = m ? m[2] : e.sqlMessage;
    status = SIGNAL_STATUS[code] ?? 422;
  } else if (e.errno === 1062) {
    status = 409; code = 'DUPLICATE';
    message = /for key '([^']+)'/.exec(e.sqlMessage ?? '')?.[1]?.replace(/^.*\./, '') ?? 'duplicate value';
    message = `A record with the same ${message.replace(/^uq_[a-z]+_/, '').replace(/_/g, ' ')} already exists`;
  } else if (e.errno === 1451) {
    status = 409; code = 'IN_USE'; message = 'This record is referenced by other data and cannot be removed';
  } else if (e.errno === 1452) {
    status = 422; code = 'INVALID_REFERENCE'; message = 'A referenced record does not exist';
  } else if (e.errno === 3819) {
    status = 422; code = 'CHECK_FAILED'; message = 'The submitted values violate a database rule';
  } else if (e.type === 'entity.parse.failed') {
    status = 400; code = 'BAD_JSON'; message = 'Request body is not valid JSON';
  } else if (e.type === 'entity.too.large') {
    status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Request body is too large';
  }

  if (status >= 500) logger.error(`${req.method} ${req.originalUrl} -> ${status}`, env.isProd ? (err as Error).message : err);
  res.status(status).json({ success: false, error: { code, message, ...(details ? { details } : {}) } });
}
