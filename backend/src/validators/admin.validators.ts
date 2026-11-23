import { z } from 'zod';
import { dateStr, pageQuery, password } from './common';

export const userListQuery = z.object({
  ...pageQuery,
  q: z.string().trim().max(100).optional(),
  role: z.enum(['admin', 'faculty', 'student']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  departmentId: z.coerce.number().int().positive().optional(),
});
export const userCreate = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(150),
  password,
  role: z.enum(['admin', 'faculty', 'student']),
  memberId: z.string().trim().min(3).max(30),
  departmentId: z.coerce.number().int().positive().nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
});
export const userUpdate = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().toLowerCase().email().max(150).optional(),
  role: z.enum(['admin', 'faculty', 'student']).optional(),
  memberId: z.string().trim().min(3).max(30).optional(),
  departmentId: z.coerce.number().int().positive().nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  status: z.enum(['active', 'suspended']).optional(),
});
export const resetPasswordBody = z.object({ password });

export const rangeQuery = z.object({ from: dateStr.optional(), to: dateStr.optional() });
export const reportQuery = z.object({ from: dateStr, to: dateStr, status: z.enum(['pending', 'approved', 'rejected', 'cancelled', 'completed']).optional() });

export const activityQuery = z.object({
  ...pageQuery,
  category: z.string().max(30).optional(), action: z.string().max(60).optional(), q: z.string().trim().max(100).optional(),
  userId: z.coerce.number().int().positive().optional(), from: dateStr.optional(), to: dateStr.optional(),
  success: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});
export const bookingAuditQuery = z.object({
  ...pageQuery,
  event: z.string().max(30).optional(), bookingId: z.coerce.number().int().positive().optional(), q: z.string().trim().max(100).optional(),
});
export const notificationQuery = z.object({
  ...pageQuery, unread: z.enum(['true', 'false']).transform((v) => v === 'true').optional(), type: z.string().max(30).optional(),
});
export const settingsBody = z.record(z.string(), z.union([z.string(), z.number()]).transform(String));
