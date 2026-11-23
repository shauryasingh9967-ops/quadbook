import { Request } from 'express';
type FilterQuery<T> = Record<string, any>; // eslint-disable-line
import { ActivityLog } from '../models/ActivityLog';
import { BookingAudit } from '../models/BookingAudit';
import { NotificationHistory } from '../models/NotificationHistory';
import { mongoState, safeWrite } from '../db/mongo';
import { ApiError } from '../utils/apiError';
import { Page } from '../utils/http';

interface Actor { id?: number; email?: string; name?: string; role?: string }

export function actorOf(req: Request): Actor {
  return req.user ? { id: req.user.id, email: req.user.email, name: req.user.name, role: req.user.role } : {};
}

export function logActivity(
  req: Request | null,
  e: { action: string; category: string; description?: string; entityType?: string; entityId?: string | number;
       metadata?: Record<string, unknown>; success?: boolean; actor?: Actor },
) {
  const actor = e.actor ?? (req ? actorOf(req) : {});
  const doc = {
    userId: actor.id, userEmail: actor.email, userName: actor.name, role: actor.role,
    action: e.action, category: e.category, description: e.description,
    entityType: e.entityType, entityId: e.entityId !== undefined ? String(e.entityId) : undefined,
    metadata: e.metadata, success: e.success ?? true,
    ip: req?.ip, userAgent: req?.get('user-agent')?.slice(0, 200), createdAt: new Date(),
  };
  safeWrite(() => ActivityLog.create(doc));
}

export function logBookingEvent(e: {
  event: 'created' | 'updated' | 'approved' | 'rejected' | 'cancelled' | 'conflict_blocked' | 'auto_cancelled';
  booking?: Record<string, unknown> | null; actor?: Actor; note?: string; resourceId?: number; resourceName?: string;
}) {
  const b = e.booking ?? {};
  const doc = {
    bookingId: b.id as number | undefined, bookingCode: b.bookingCode as string | undefined,
    event: e.event, actorId: e.actor?.id, actorName: e.actor?.name, actorRole: e.actor?.role,
    resourceId: (b.resourceId as number | undefined) ?? e.resourceId,
    resourceName: (b.resourceName as string | undefined) ?? e.resourceName,
    snapshot: e.booking ? { status: b.status, startTime: b.startTime, endTime: b.endTime, purpose: b.purpose, attendees: b.attendees } : undefined,
    note: e.note, createdAt: new Date(),
  };
  safeWrite(() => BookingAudit.create(doc));
}

function requireMongo() {
  if (!mongoState.connected) {
    throw new ApiError(503, 'MONGO_UNAVAILABLE',
      'The audit database (MongoDB) is currently unavailable. Core booking features still work; events are queued and will appear once it reconnects.');
  }
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function listActivity(
  f: { category?: string; action?: string; q?: string; userId?: number; from?: string; to?: string; success?: boolean },
  p: Page,
) {
  requireMongo();
  const where: FilterQuery<unknown> = {};
  if (f.category) where.category = f.category;
  if (f.action) where.action = f.action;
  if (f.userId) where.userId = f.userId;
  if (f.success !== undefined) where.success = f.success;
  if (f.q) {
    const rx = new RegExp(esc(f.q), 'i');
    where.$or = [{ userEmail: rx }, { userName: rx }, { description: rx }, { action: rx }];
  }
  if (f.from || f.to) {
    where.createdAt = {
      ...(f.from ? { $gte: new Date(`${f.from}T00:00:00`) } : {}),
      ...(f.to ? { $lte: new Date(`${f.to}T23:59:59.999`) } : {}),
    };
  }
  const [items, total] = await Promise.all([
    ActivityLog.find(where).sort({ createdAt: -1 }).skip(p.offset).limit(p.limit).lean(),
    ActivityLog.countDocuments(where),
  ]);
  return { items, total };
}

export async function listBookingAudit(f: { event?: string; bookingId?: number; q?: string }, p: Page) {
  requireMongo();
  const where: FilterQuery<unknown> = {};
  if (f.event) where.event = f.event;
  if (f.bookingId) where.bookingId = f.bookingId;
  if (f.q) {
    const rx = new RegExp(esc(f.q), 'i');
    where.$or = [{ bookingCode: rx }, { actorName: rx }, { resourceName: rx }, { note: rx }];
  }
  const [items, total] = await Promise.all([
    BookingAudit.find(where).sort({ createdAt: -1 }).skip(p.offset).limit(p.limit).lean(),
    BookingAudit.countDocuments(where),
  ]);
  return { items, total };
}

export async function listMyActivity(userId: number, limit = 15) {
  if (!mongoState.connected) return { available: false, items: [] };
  const items = await ActivityLog.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();
  return { available: true, items };
}

export async function listNotificationHistory(userId: number, p: Page) {
  requireMongo();
  const [items, total] = await Promise.all([
    NotificationHistory.find({ userId }).sort({ createdAtSource: -1 }).skip(p.offset).limit(p.limit).lean(),
    NotificationHistory.countDocuments({ userId }),
  ]);
  return { items, total };
}

export async function auditSummary() {
  requireMongo();
  const since = new Date(Date.now() - 7 * 86400_000);
  const [byCategory, byEvent, totals, notif] = await Promise.all([
    ActivityLog.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    BookingAudit.aggregate([{ $group: { _id: '$event', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Promise.all([ActivityLog.estimatedDocumentCount(), BookingAudit.estimatedDocumentCount()]),
    NotificationHistory.estimatedDocumentCount(),
  ]);
  const failedLogins = await ActivityLog.countDocuments({ action: 'auth.login_failed', createdAt: { $gte: since } });
  return {
    byCategory: byCategory.map((r) => ({ category: r._id, count: r.count })),
    bookingEvents: byEvent.map((r) => ({ event: r._id, count: r.count })),
    totals: { activityLogs: totals[0], bookingAudit: totals[1], notificationHistory: notif },
    failedLoginsLast7Days: failedLogins,
  };
}
