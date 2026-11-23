import { Request, Response } from 'express';
import * as bs from '../services/bookingService';
import { logActivity } from '../services/auditService';
import { asyncHandler, created, ok, pageMeta, parsePage } from '../utils/http';

export const create = asyncHandler(async (req: Request, res: Response) => {
  const b = await bs.createBooking(req.user!, req.valid.body) as { id: number; bookingCode: string; resourceName: string; status: string };
  logActivity(req, { action: 'booking.create', category: 'booking', entityType: 'booking', entityId: b.id, description: `Booked ${b.resourceName} (${b.bookingCode}) - ${b.status}` });
  created(res, b);
});
export const list = asyncHandler(async (req: Request, res: Response) => {
  const p = parsePage(req.valid.query, 10);
  const { items, total } = await bs.listBookings(req.user!, req.valid.query, p);
  ok(res, items, pageMeta(p, total));
});
export const stats = asyncHandler(async (_req: Request, res: Response) => ok(res, await bs.bookingStatusCounts()));
export const detail = asyncHandler(async (req: Request, res: Response) => ok(res, await bs.getBookingDetail(req.user!, req.valid.params.id)));
export const update = asyncHandler(async (req: Request, res: Response) => {
  const b = await bs.updateBooking(req.user!, req.valid.params.id, req.valid.body) as { bookingCode: string };
  logActivity(req, { action: 'booking.update', category: 'booking', entityType: 'booking', entityId: req.valid.params.id, description: `Edited booking ${b.bookingCode}` });
  ok(res, b);
});
export const cancel = asyncHandler(async (req: Request, res: Response) => {
  const b = await bs.cancelBooking(req.user!, req.valid.params.id, req.valid.body?.reason) as { bookingCode: string };
  logActivity(req, { action: 'booking.cancel', category: 'booking', entityType: 'booking', entityId: req.valid.params.id, description: `Cancelled booking ${b.bookingCode}` });
  ok(res, b);
});
export const decide = asyncHandler(async (req: Request, res: Response) => {
  const { decision, remarks } = req.valid.body;
  const b = await bs.decideBooking(req.user!, req.valid.params.id, decision, remarks) as { bookingCode: string };
  logActivity(req, { action: `booking.${decision === 'approved' ? 'approve' : 'reject'}`, category: 'booking', entityType: 'booking', entityId: req.valid.params.id, description: `${decision} booking ${b.bookingCode}`, metadata: { remarks } });
  ok(res, b);
});
