import { Request, Response } from 'express';
import { env } from '../config/env';
import * as auth from '../services/authService';
import { logActivity } from '../services/auditService';
import { ApiError } from '../utils/apiError';
import { asyncHandler, created, ok } from '../utils/http';

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { user, token } = await auth.register(req.valid.body);
  const u = user as { id: number; email: string; fullName: string; role: string };
  logActivity(req, { action: 'auth.register', category: 'auth', description: `New ${u.role} account registered`, actor: { id: u.id, email: u.email, name: u.fullName, role: u.role } });
  created(res, { user, token });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  try {
    const { user, token } = await auth.login(req.valid.body.email, req.valid.body.password);
    const u = user as { id: number; email: string; fullName: string; role: string };
    logActivity(req, { action: 'auth.login', category: 'auth', description: 'Signed in', actor: { id: u.id, email: u.email, name: u.fullName, role: u.role } });
    ok(res, { user, token });
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      logActivity(req, { action: 'auth.login_failed', category: 'auth', description: e.message, success: false, actor: { email: req.valid.body.email } });
    }
    throw e;
  }
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  await auth.logout(req.user!.jti, req.user!.exp);
  logActivity(req, { action: 'auth.logout', category: 'auth', description: 'Signed out' });
  ok(res, { loggedOut: true });
});

export const me = asyncHandler(async (req: Request, res: Response) => ok(res, await auth.getUserById(req.user!.id)));

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { token } = await auth.forgotPassword(req.valid.body.email);
  logActivity(req, { action: 'auth.password_reset_requested', category: 'auth', actor: { email: req.valid.body.email }, success: Boolean(token) });
  // No e-mail server is configured in this capstone: in development the reset link is returned so it can be demonstrated.
  ok(res, {
    message: 'If an account exists for that e-mail, a reset link has been generated.',
    ...(token && !env.isProd ? { devResetToken: token } : {}),
  });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = await auth.resetPassword(req.valid.body.token, req.valid.body.password);
  logActivity(req, { action: 'auth.password_reset', category: 'auth', description: 'Password reset via emailed link', actor: { id: userId } });
  ok(res, { reset: true });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = await auth.updateProfile(req.user!.id, req.valid.body);
  logActivity(req, { action: 'user.profile_update', category: 'user', description: 'Updated own profile' });
  ok(res, user);
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  await auth.changePassword(req.user!.id, req.valid.body.currentPassword, req.valid.body.newPassword);
  logActivity(req, { action: 'auth.password_change', category: 'auth', description: 'Changed own password' });
  ok(res, { changed: true });
});
