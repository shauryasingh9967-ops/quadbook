import { NextFunction, Request, RequestHandler, Response } from 'express';

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res, next).catch(next); };

export function ok(res: Response, data: unknown, meta?: unknown, status = 200) {
  return res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });
}
export const created = (res: Response, data: unknown) => ok(res, data, undefined, 201);

export interface Page { page: number; limit: number; offset: number }
export function parsePage(q: Record<string, unknown>, defLimit = 10, maxLimit = 100): Page {
  const page = Math.max(1, parseInt(String(q.page ?? '1'), 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(String(q.limit ?? defLimit), 10) || defLimit));
  return { page, limit, offset: (page - 1) * limit };
}
export const pageMeta = (p: Page, total: number) => ({
  page: p.page, limit: p.limit, total, totalPages: Math.max(1, Math.ceil(total / p.limit)),
});
