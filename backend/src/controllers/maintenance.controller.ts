import { Request, Response } from 'express';
import * as ms from '../services/maintenanceService';
import { logActivity } from '../services/auditService';
import { asyncHandler, created, ok, pageMeta, parsePage } from '../utils/http';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const p = parsePage(req.valid.query, 10);
  const { items, total } = await ms.listMaintenance(req.valid.query, p);
  ok(res, items, { ...pageMeta(p, total), summary: await ms.maintenanceSummary() });
});
export const mine = asyncHandler(async (req: Request, res: Response) => {
  const p = parsePage(req.valid.query, 10);
  const { items, total } = await ms.listMaintenance({ ...req.valid.query, reportedBy: req.user!.id }, p);
  ok(res, items, pageMeta(p, total));
});
export const create = asyncHandler(async (req: Request, res: Response) => {
  const m = await ms.createMaintenance(req.user!, req.valid.body, false) as unknown as { id: number; title: string; cancelledBookings: number };
  logActivity(req, { action: 'maintenance.create', category: 'maintenance', entityType: 'maintenance', entityId: m.id, description: `Maintenance: ${m.title}`, metadata: { cancelledBookings: m.cancelledBookings } });
  created(res, m);
});
export const report = asyncHandler(async (req: Request, res: Response) => {
  const m = await ms.createMaintenance(req.user!, req.valid.body, true) as unknown as { id: number; title: string };
  logActivity(req, { action: 'maintenance.report', category: 'maintenance', entityType: 'maintenance', entityId: m.id, description: `Issue reported: ${m.title}` });
  created(res, m);
});
export const update = asyncHandler(async (req: Request, res: Response) => {
  const m = await ms.updateMaintenance(req.user!, req.valid.params.id, req.valid.body) as unknown as { title: string; status: string; cancelledBookings: number };
  logActivity(req, { action: 'maintenance.update', category: 'maintenance', entityType: 'maintenance', entityId: req.valid.params.id, description: `${m.title} -> ${m.status}`, metadata: { cancelledBookings: m.cancelledBookings } });
  ok(res, m);
});
export const remove = asyncHandler(async (req: Request, res: Response) => {
  await ms.deleteMaintenance(req.valid.params.id);
  logActivity(req, { action: 'maintenance.delete', category: 'maintenance', entityType: 'maintenance', entityId: req.valid.params.id });
  ok(res, { deleted: true });
});
export const staff = asyncHandler(async (_req: Request, res: Response) => ok(res, await ms.listStaff()));
