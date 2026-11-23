import { NextFunction, Request, Response } from 'express';
import { ZodTypeAny } from 'zod';
import { ApiError } from '../utils/apiError';

export const validate = (s: { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny }) =>
  (req: Request, _res: Response, next: NextFunction) => {
    req.valid = {};
    for (const part of ['body', 'query', 'params'] as const) {
      const schema = s[part];
      if (!schema) continue;
      const r = schema.safeParse(req[part]);
      if (!r.success) {
        return next(new ApiError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields',
          r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))));
      }
      req.valid[part] = r.data;
    }
    next();
  };
