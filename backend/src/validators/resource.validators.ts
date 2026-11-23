import { z } from 'zod';
import { dateStr, dateTimeStr, pageQuery } from './common';

const bool = z.union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')]);

export const resourceListQuery = z.object({
  ...pageQuery,
  q: z.string().trim().max(100).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  kind: z.enum(['lab', 'classroom', 'hall', 'equipment', 'other']).optional(),
  buildingId: z.coerce.number().int().positive().optional(),
  departmentId: z.coerce.number().int().positive().optional(),
  status: z.enum(['available', 'maintenance', 'retired']).optional(),
  minCapacity: z.coerce.number().int().min(1).optional(),
  sort: z.enum(['name', 'capacity', 'capacity_asc', 'popular', 'newest']).optional(),
});
export const scheduleQuery = z.object({ from: dateStr, to: dateStr });

export const resourceBody = z.object({
  code: z.string().trim().min(2).max(20),
  name: z.string().trim().min(3).max(120),
  categoryId: z.coerce.number().int().positive(),
  buildingId: z.coerce.number().int().positive(),
  roomNumber: z.string().trim().min(1).max(20),
  floorNo: z.coerce.number().int().min(0).max(60).default(0),
  departmentId: z.coerce.number().int().positive().nullable().optional(),
  capacity: z.coerce.number().int().min(1).max(5000),
  description: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(['available', 'maintenance', 'retired']).optional(),
  requiresApproval: bool.default(true),
});

export const equipmentListQuery = z.object({
  ...pageQuery,
  q: z.string().trim().max(100).optional(),
  resourceId: z.coerce.number().int().positive().optional(),
  status: z.enum(['operational', 'under_repair', 'retired']).optional(),
});
export const equipmentBody = z.object({
  resourceId: z.coerce.number().int().positive(),
  name: z.string().trim().min(2).max(120),
  assetTag: z.string().trim().min(2).max(30),
  quantityTotal: z.coerce.number().int().min(1).max(10000),
  status: z.enum(['operational', 'under_repair', 'retired']).default('operational'),
  bookableAddon: bool.default(false),
});

export const bookingBody = z.object({
  resourceId: z.coerce.number().int().positive(),
  startTime: dateTimeStr,
  endTime: dateTimeStr,
  purpose: z.string().trim().min(5, 'Describe the purpose (min 5 characters)').max(255),
  attendees: z.coerce.number().int().min(1).max(5000),
  equipment: z.array(z.object({ equipmentId: z.coerce.number().int().positive(), quantity: z.coerce.number().int().min(1).max(1000) })).max(20).optional(),
});
export const bookingUpdateBody = bookingBody.omit({ resourceId: true, equipment: true });
export const bookingListQuery = z.object({
  ...pageQuery,
  status: z.string().regex(/^[a-z,]+$/).optional(),
  scope: z.enum(['upcoming', 'history']).optional(),
  q: z.string().trim().max(100).optional(),
  resourceId: z.coerce.number().int().positive().optional(),
  userId: z.coerce.number().int().positive().optional(),
  kind: z.enum(['lab', 'classroom', 'hall', 'equipment', 'other']).optional(),
  from: dateStr.optional(), to: dateStr.optional(),
  sort: z.enum(['newest', 'start_asc', 'start_desc']).optional(),
});
export const cancelBody = z.object({ reason: z.string().trim().max(255).optional() });
export const decisionBody = z.object({
  decision: z.enum(['approved', 'rejected']),
  remarks: z.string().trim().max(255).optional(),
}).refine((d) => d.decision === 'approved' || (d.remarks && d.remarks.length >= 3), { message: 'Please give a reason for rejecting', path: ['remarks'] });

export const maintenanceCreate = z.object({
  resourceId: z.coerce.number().int().positive(),
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().max(2000).nullable().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  status: z.enum(['reported', 'open', 'in_progress', 'resolved', 'closed']).optional(),
  startsAt: dateTimeStr.optional(),
  expectedEnd: dateTimeStr.nullable().optional(),
  assignedTo: z.coerce.number().int().positive().nullable().optional(),
});
export const maintenanceUpdate = maintenanceCreate.omit({ resourceId: true }).partial();
export const maintenanceListQuery = z.object({
  ...pageQuery,
  status: z.enum(['reported', 'open', 'in_progress', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  resourceId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(100).optional(),
});
