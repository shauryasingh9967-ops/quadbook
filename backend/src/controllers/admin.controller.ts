import { Request, Response } from 'express';
import * as users from '../services/userService';
import * as analytics from '../services/analyticsService';
import * as audit from '../services/auditService';
import * as reports from '../services/reportService';
import * as settings from '../services/settingsService';
import * as notif from '../services/notificationService';
import { mongoState } from '../db/mongo';
import { pingMySql } from '../db/mysql';
import { asyncHandler, created, ok, pageMeta, parsePage } from '../utils/http';
import { logActivity } from '../services/auditService';

// ---- users
export const userList = asyncHandler(async (req: Request, res: Response) => {
  const p = parsePage(req.valid.query, 10);
  const { items, total, roleCounts } = await users.listUsers(req.valid.query, p);
  ok(res, items, { ...pageMeta(p, total), roleCounts });
});
export const userCreate = asyncHandler(async (req: Request, res: Response) => {
  const u = await users.createUser(req.valid.body) as { id: number; fullName: string; role: string };
  logActivity(req, { action: 'user.create', category: 'user', entityType: 'user', entityId: u.id, description: `Created ${u.role} ${u.fullName}` });
  created(res, u);
});
export const userUpdate = asyncHandler(async (req: Request, res: Response) => {
  const u = await users.updateUser(req.user!.id, req.valid.params.id, req.valid.body) as { fullName: string };
  logActivity(req, { action: 'user.update', category: 'user', entityType: 'user', entityId: req.valid.params.id, description: `Updated ${u.fullName}`, metadata: { fields: Object.keys(req.valid.body) } });
  ok(res, u);
});
export const userResetPassword = asyncHandler(async (req: Request, res: Response) => {
  await users.resetUserPassword(req.valid.params.id, req.valid.body.password);
  logActivity(req, { action: 'user.password_reset', category: 'user', entityType: 'user', entityId: req.valid.params.id, description: 'Administrator reset a password' });
  ok(res, { reset: true });
});
export const userDelete = asyncHandler(async (req: Request, res: Response) => {
  const r = await users.deleteUser(req.user!.id, req.valid.params.id);
  logActivity(req, { action: r.deleted ? 'user.delete' : 'user.suspend', category: 'user', entityType: 'user', entityId: req.valid.params.id });
  ok(res, r);
});

// ---- analytics
export const overview = asyncHandler(async (_req: Request, res: Response) => ok(res, await analytics.adminOverview()));
export const trends = asyncHandler(async (_req: Request, res: Response) => ok(res, await analytics.monthlyTrends(12)));
export const popular = asyncHandler(async (_req: Request, res: Response) => ok(res, await analytics.popularResources(8)));
export const utilization = asyncHandler(async (req: Request, res: Response) => {
  const d = analytics.defaultRange(30);
  ok(res, await analytics.utilization(req.valid.query.from ?? d.from, req.valid.query.to ?? d.to));
});
export const reportBundle = asyncHandler(async (req: Request, res: Response) => ok(res, await analytics.reportsBundle(req.valid.query.from, req.valid.query.to)));
export const bookingsCsv = asyncHandler(async (req: Request, res: Response) => {
  const rows = await reports.bookingsReport(req.valid.query);
  logActivity(req, { action: 'report.export', category: 'system', description: `Exported ${rows.length} bookings to CSV`, metadata: req.valid.query });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="bookings_${req.valid.query.from}_${req.valid.query.to}.csv"`);
  res.send('﻿' + reports.bookingsToCsv(rows));
});

// ---- audit (MongoDB)
export const activityList = asyncHandler(async (req: Request, res: Response) => {
  const p = parsePage(req.valid.query, 15);
  const { items, total } = await audit.listActivity(req.valid.query, p);
  ok(res, items, pageMeta(p, total));
});
export const bookingAuditList = asyncHandler(async (req: Request, res: Response) => {
  const p = parsePage(req.valid.query, 15);
  const { items, total } = await audit.listBookingAudit(req.valid.query, p);
  ok(res, items, pageMeta(p, total));
});
export const auditSummary = asyncHandler(async (_req: Request, res: Response) => ok(res, await audit.auditSummary()));

// ---- settings + health
export const settingsGet = asyncHandler(async (_req: Request, res: Response) => ok(res, await settings.getAllSettings()));
export const settingsUpdate = asyncHandler(async (req: Request, res: Response) => {
  const s = await settings.updateSettings(req.valid.body);
  logActivity(req, { action: 'settings.update', category: 'system', description: 'Updated system settings', metadata: req.valid.body });
  ok(res, s);
});
export const health = asyncHandler(async (_req: Request, res: Response) => {
  const mysqlUp = await pingMySql();
  ok(res, {
    status: mysqlUp ? 'ok' : 'degraded',
    uptimeSeconds: Math.round(process.uptime()),
    mysql: { role: 'primary (relational)', connected: mysqlUp },
    mongodb: { role: 'secondary (audit / activity / notification history)', ...mongoState },
  });
});

// ---- per-user (any authenticated user)
export const myOverview = asyncHandler(async (req: Request, res: Response) => ok(res, await analytics.myOverview(req.user!.id)));
export const myActivity = asyncHandler(async (req: Request, res: Response) => ok(res, await audit.listMyActivity(req.user!.id)));
export const notifList = asyncHandler(async (req: Request, res: Response) => {
  const p = parsePage(req.valid.query, 10);
  const { items, total } = await notif.listNotifications(req.user!.id, p, Boolean(req.valid.query.unread), req.valid.query.type);
  ok(res, items, { ...pageMeta(p, total), unread: await notif.unreadCount(req.user!.id) });
});
export const notifUnread = asyncHandler(async (req: Request, res: Response) => ok(res, { unread: await notif.unreadCount(req.user!.id) }));
export const notifRead = asyncHandler(async (req: Request, res: Response) => ok(res, await notif.markRead(req.user!.id, req.valid.params.id)));
export const notifReadAll = asyncHandler(async (req: Request, res: Response) => ok(res, await notif.markAllRead(req.user!.id)));
export const notifDelete = asyncHandler(async (req: Request, res: Response) => { await notif.deleteNotification(req.user!.id, req.valid.params.id); ok(res, { deleted: true }); });
export const notifHistory = asyncHandler(async (req: Request, res: Response) => {
  await notif.syncNotificationHistory();
  const p = parsePage(req.valid.query, 10);
  const { items, total } = await audit.listNotificationHistory(req.user!.id, p);
  ok(res, items, pageMeta(p, total));
});

// ---- public
export const publicOverview = asyncHandler(async (_req: Request, res: Response) => {
  const [stats, resources, cfg] = await Promise.all([analytics.publicStats(), analytics.publicResources(6), settings.getPublicSettings()]);
  ok(res, { stats, resources, settings: cfg });
});
export const publicAvailability = asyncHandler(async (_req: Request, res: Response) => ok(res, await analytics.publicAvailability(5)));
