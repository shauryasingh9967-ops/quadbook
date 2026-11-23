import { Request, Response } from 'express';
import * as rs from '../services/resourceService';
import { logActivity } from '../services/auditService';
import { asyncHandler, created, ok, pageMeta, parsePage } from '../utils/http';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const p = parsePage(req.valid.query, 12);
  const { items, total } = await rs.listResources(req.valid.query, p, req.user!.role === 'admin');
  ok(res, items, pageMeta(p, total));
});
export const detail = asyncHandler(async (req: Request, res: Response) => ok(res, await rs.getResourceDetail(req.valid.params.id, req.user!)));
export const schedule = asyncHandler(async (req: Request, res: Response) =>
  ok(res, await rs.getScheduleEvents(req.valid.params.id, req.valid.query.from, req.valid.query.to, req.user!)));
export const lookups = asyncHandler(async (_req: Request, res: Response) => ok(res, await rs.getLookups()));

export const create = asyncHandler(async (req: Request, res: Response) => {
  const r = await rs.createResource(req.valid.body) as { id: number; name: string };
  logActivity(req, { action: 'resource.create', category: 'resource', entityType: 'resource', entityId: r.id, description: `Created resource ${r.name}` });
  created(res, r);
});
export const update = asyncHandler(async (req: Request, res: Response) => {
  const r = await rs.updateResource(req.valid.params.id, req.valid.body) as { name: string };
  logActivity(req, { action: 'resource.update', category: 'resource', entityType: 'resource', entityId: req.valid.params.id, description: `Updated resource ${r.name}` });
  ok(res, r);
});
export const remove = asyncHandler(async (req: Request, res: Response) => {
  const r = await rs.deleteResource(req.valid.params.id);
  logActivity(req, { action: r.deleted ? 'resource.delete' : 'resource.retire', category: 'resource', entityType: 'resource', entityId: req.valid.params.id });
  ok(res, r);
});

export const equipmentList = asyncHandler(async (req: Request, res: Response) => {
  const p = parsePage(req.valid.query, 10);
  const { items, total } = await rs.listEquipment(req.valid.query, p);
  ok(res, items, pageMeta(p, total));
});
export const equipmentCreate = asyncHandler(async (req: Request, res: Response) => {
  const e = await rs.createEquipment(req.valid.body) as { id: number; name: string };
  logActivity(req, { action: 'equipment.create', category: 'resource', entityType: 'equipment', entityId: e.id, description: `Added equipment ${e.name}` });
  created(res, e);
});
export const equipmentUpdate = asyncHandler(async (req: Request, res: Response) => {
  const e = await rs.updateEquipment(req.valid.params.id, req.valid.body) as { name: string };
  logActivity(req, { action: 'equipment.update', category: 'resource', entityType: 'equipment', entityId: req.valid.params.id, description: `Updated equipment ${e.name}` });
  ok(res, e);
});
export const equipmentDelete = asyncHandler(async (req: Request, res: Response) => {
  const r = await rs.deleteEquipment(req.valid.params.id);
  logActivity(req, { action: 'equipment.delete', category: 'resource', entityType: 'equipment', entityId: req.valid.params.id });
  ok(res, r);
});
