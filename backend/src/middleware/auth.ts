import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { RowDataPacket } from 'mysql2';
import { env } from '../config/env';
import { queryOne } from '../db/mysql';
import { ApiError } from '../utils/apiError';
import { asyncHandler } from '../utils/http';

export interface JwtPayload { sub: string; jti: string; exp: number; role: string }

export const authenticate = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw ApiError.unauthorized();

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as unknown as JwtPayload;
  } catch {
    throw ApiError.unauthorized('Session expired or invalid. Please sign in again.');
  }

  // logout revokes the token id; account state + role are always read fresh from MySQL
  const row = await queryOne<RowDataPacket>(
    `SELECT u.id, u.email, u.full_name, u.status, r.name AS role,
            (SELECT COUNT(*) FROM revoked_tokens t WHERE t.jti = ?) AS revoked
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
    [payload.jti, Number(payload.sub)],
  );
  if (!row || row.revoked > 0) throw ApiError.unauthorized('Session expired or invalid. Please sign in again.');
  if (row.status !== 'active') throw ApiError.forbidden('This account has been suspended. Contact an administrator.');

  req.user = { id: row.id, email: row.email, name: row.full_name, role: row.role, jti: payload.jti, exp: payload.exp };
  next();
});

/** Role-based access control. Always enforced server-side, whatever the frontend shows. */
export const requireRole = (...roles: Array<'admin' | 'faculty' | 'student'>) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
    next();
  };
