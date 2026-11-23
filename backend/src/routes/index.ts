import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { authLimiter } from '../middleware/rateLimit';
import { idParam } from '../validators/common';
import * as A from '../validators/auth.validators';
import * as R from '../validators/resource.validators';
import * as M from '../validators/admin.validators';
import * as auth from '../controllers/auth.controller';
import * as res from '../controllers/resource.controller';
import * as book from '../controllers/booking.controller';
import * as maint from '../controllers/maintenance.controller';
import * as adm from '../controllers/admin.controller';
import { listDepartments } from '../services/authService';
import { getPublicSettings } from '../services/settingsService';
import { pingMySql } from '../db/mysql';
import { mongoState } from '../db/mongo';
import { asyncHandler, ok } from '../utils/http';

const api = Router();
const admin = requireRole('admin');

// ------------------------------------------------------------- public
api.get('/health', asyncHandler(async (_req, r) => {
  const mysql = await pingMySql();
  ok(r, { status: mysql ? 'ok' : 'degraded', mysql, mongodb: mongoState.connected });
}));
api.get('/public/overview', adm.publicOverview);
api.get('/public/availability', adm.publicAvailability);
api.get('/public/departments', asyncHandler(async (_q, r) => ok(r, await listDepartments())));
api.get('/public/settings', asyncHandler(async (_q, r) => ok(r, await getPublicSettings())));

// --------------------------------------------------------------- auth
api.post('/auth/register', authLimiter, validate({ body: A.registerSchema }), auth.register);
api.post('/auth/login', authLimiter, validate({ body: A.loginSchema }), auth.login);
api.post('/auth/forgot-password', authLimiter, validate({ body: A.forgotSchema }), auth.forgotPassword);
api.post('/auth/reset-password', authLimiter, validate({ body: A.resetSchema }), auth.resetPassword);
api.post('/auth/logout', authenticate, auth.logout);
api.get('/auth/me', authenticate, auth.me);
api.patch('/auth/profile', authenticate, validate({ body: A.profileSchema }), auth.updateProfile);
api.post('/auth/change-password', authenticate, validate({ body: A.changePasswordSchema }), auth.changePassword);

// everything below needs a valid session
api.use(authenticate);

// ---------------------------------------------------------- resources
api.get('/resources', validate({ query: R.resourceListQuery }), res.list);
api.get('/resources/lookups', res.lookups);
api.get('/resources/:id', validate({ params: idParam }), res.detail);
api.get('/resources/:id/schedule', validate({ params: idParam, query: R.scheduleQuery }), res.schedule);
api.post('/resources', admin, validate({ body: R.resourceBody }), res.create);
api.put('/resources/:id', admin, validate({ params: idParam, body: R.resourceBody }), res.update);
api.delete('/resources/:id', admin, validate({ params: idParam }), res.remove);

api.get('/equipment', admin, validate({ query: R.equipmentListQuery }), res.equipmentList);
api.post('/equipment', admin, validate({ body: R.equipmentBody }), res.equipmentCreate);
api.put('/equipment/:id', admin, validate({ params: idParam, body: R.equipmentBody }), res.equipmentUpdate);
api.delete('/equipment/:id', admin, validate({ params: idParam }), res.equipmentDelete);

// ----------------------------------------------------------- bookings
api.post('/bookings', validate({ body: R.bookingBody }), book.create);
api.get('/bookings', validate({ query: R.bookingListQuery }), book.list);
api.get('/bookings/stats', admin, book.stats);
api.get('/bookings/:id', validate({ params: idParam }), book.detail);
api.put('/bookings/:id', validate({ params: idParam, body: R.bookingUpdateBody }), book.update);
api.post('/bookings/:id/cancel', validate({ params: idParam, body: R.cancelBody }), book.cancel);
api.post('/bookings/:id/decision', admin, validate({ params: idParam, body: R.decisionBody }), book.decide);

// -------------------------------------------------------- maintenance
api.get('/maintenance', admin, validate({ query: R.maintenanceListQuery }), maint.list);
api.get('/maintenance/mine', validate({ query: R.maintenanceListQuery }), maint.mine);
api.get('/maintenance/staff', admin, maint.staff);
api.post('/maintenance', admin, validate({ body: R.maintenanceCreate }), maint.create);
api.post('/maintenance/report', validate({ body: R.maintenanceCreate.pick({ resourceId: true, title: true, description: true, priority: true }) }), maint.report);
api.patch('/maintenance/:id', admin, validate({ params: idParam, body: R.maintenanceUpdate }), maint.update);
api.delete('/maintenance/:id', admin, validate({ params: idParam }), maint.remove);

// ------------------------------------------------------ notifications
api.get('/notifications', validate({ query: M.notificationQuery }), adm.notifList);
api.get('/notifications/unread-count', adm.notifUnread);
api.get('/notifications/history', validate({ query: M.notificationQuery }), adm.notifHistory);
api.post('/notifications/read-all', adm.notifReadAll);
api.patch('/notifications/:id/read', validate({ params: idParam }), adm.notifRead);
api.delete('/notifications/:id', validate({ params: idParam }), adm.notifDelete);

// ------------------------------------------------------------- me
api.get('/me/overview', adm.myOverview);
api.get('/me/activity', adm.myActivity);

// -------------------------------------------------------------- admin
const a = Router();
a.use(admin);
a.get('/users', validate({ query: M.userListQuery }), adm.userList);
a.post('/users', validate({ body: M.userCreate }), adm.userCreate);
a.patch('/users/:id', validate({ params: idParam, body: M.userUpdate }), adm.userUpdate);
a.post('/users/:id/reset-password', validate({ params: idParam, body: M.resetPasswordBody }), adm.userResetPassword);
a.delete('/users/:id', validate({ params: idParam }), adm.userDelete);
a.get('/analytics/overview', adm.overview);
a.get('/analytics/trends', adm.trends);
a.get('/analytics/popular', adm.popular);
a.get('/analytics/utilization', validate({ query: M.rangeQuery }), adm.utilization);
a.get('/reports/bundle', validate({ query: M.reportQuery.omit({ status: true }) }), adm.reportBundle);
a.get('/reports/bookings.csv', validate({ query: M.reportQuery }), adm.bookingsCsv);
a.get('/audit/activity', validate({ query: M.activityQuery }), adm.activityList);
a.get('/audit/bookings', validate({ query: M.bookingAuditQuery }), adm.bookingAuditList);
a.get('/audit/summary', adm.auditSummary);
a.get('/settings', adm.settingsGet);
a.put('/settings', validate({ body: M.settingsBody }), adm.settingsUpdate);
a.get('/health', adm.health);
api.use('/admin', a);

export default api;
