import { z } from 'zod';
import { password } from './common';

export const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(150),
  password,
  role: z.enum(['student', 'faculty']),
  memberId: z.string().trim().min(3).max(30),
  departmentId: z.coerce.number().int().positive(),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
});
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(72),
});
export const forgotSchema = z.object({ email: z.string().trim().toLowerCase().email() });
export const resetSchema = z.object({ token: z.string().min(20).max(200), password });
export const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  departmentId: z.coerce.number().int().positive().nullable().optional(),
});
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: password });
