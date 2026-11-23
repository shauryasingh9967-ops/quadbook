import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { migrate } from '../src/db/migrate';
import { closePool, execute, query } from '../src/db/mysql';
import { connectMongo, disconnectMongo, flushPending, mongoState } from '../src/db/mongo';
import { ActivityLog } from '../src/models/ActivityLog';
import { BookingAudit } from '../src/models/BookingAudit';
import { NotificationHistory } from '../src/models/NotificationHistory';
import { syncNotificationHistory } from '../src/services/notificationService';

const app = createApp();
const api = request(app);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pad = (n: number) => String(n).padStart(2, '0');
function day(offset: number) { // a future non-Sunday date as YYYY-MM-DD
  const d = new Date(); d.setDate(d.getDate() + offset);
  while (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const D = day(3);
const slot = (date: string, from: string, to: string) => ({ startTime: `${date}T${from}`, endTime: `${date}T${to}` });

const tokens: Record<string, string> = {};
let ids = { lab: 0, openRoom: 0, classRoom: 0, admin: 0, student: 0 };

async function login(email: string, password: string) {
  const r = await api.post('/api/auth/login').send({ email, password });
  expect(r.status).toBe(200);
  return r.body.data.token as string;
}
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

beforeAll(async () => {
  await migrate({ fresh: true, quiet: true });
  await connectMongo();
  expect(mongoState.connected).toBe(true);
  await Promise.all([ActivityLog.deleteMany({}), BookingAudit.deleteMany({}), NotificationHistory.deleteMany({})]);

  await execute("INSERT INTO departments (code, name) VALUES ('CSE', 'Computer Science')");
  await execute("INSERT INTO buildings (code, name, total_floors) VALUES ('ENG', 'Engineering', 3)");
  await execute("INSERT INTO resource_categories (name, kind) VALUES ('Computer Lab', 'lab'), ('Discussion Room', 'classroom')");
  await execute("INSERT INTO rooms (building_id, room_number, floor_no, capacity) VALUES (1, 'L1', 1, 40), (1, 'L2', 1, 8), (1, 'L3', 1, 60)");
  await execute(`INSERT INTO resources (code, name, category_id, room_id, department_id, capacity, requires_approval) VALUES
     ('LAB-T1', 'Test AI Lab', 1, 1, 1, 40, 1), ('DR-T1', 'Test Study Room', 2, 2, 1, 8, 0), ('LAB-T2', 'Test Timetabled Lab', 1, 3, 1, 60, 1)`);
  const h = await bcrypt.hash('Passw0rd!', 4);
  await execute(`INSERT INTO users (role_id, department_id, email, password_hash, full_name, member_id) VALUES
     (1, 1, 'admin@test.edu', ?, 'Test Admin', 'ADM-T1'), (2, 1, 'faculty@test.edu', ?, 'Test Faculty', 'FAC-T1'),
     (3, 1, 'student@test.edu', ?, 'Test Student', 'STU-T1')`, [h, h, h]);
  for (let i = 1; i <= 8; i++) await execute(`INSERT INTO users (role_id, department_id, email, password_hash, full_name, member_id) VALUES (3, 1, ?, ?, ?, ?)`, [`racer${i}@test.edu`, h, `Racer ${i}`, `RAC-${i}`]);
  const dow = (new Date(`${day(5)}T12:00:00`).getDay() + 6) % 7;
  await execute(`INSERT INTO academic_schedules (resource_id, course_code, course_name, semester, day_of_week, start_time, end_time, valid_from, valid_to)
     VALUES (3, 'CS999', 'Test Course', 'Autumn', ?, '10:00:00', '12:00:00', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 60 DAY))`, [dow]);
  tokens.admin = await login('admin@test.edu', 'Passw0rd!');
  tokens.student = await login('student@test.edu', 'Passw0rd!');
  tokens.faculty = await login('faculty@test.edu', 'Passw0rd!');
  ids = { lab: 1, openRoom: 2, classRoom: 3, admin: 1, student: 3 };
});

afterAll(async () => { await disconnectMongo(); await closePool(); });

describe('authentication', () => {
  it('registers a new student, hashes the password and returns a JWT', async () => {
    const r = await api.post('/api/auth/register').send({ fullName: 'New Student', email: 'new@test.edu', password: 'Str0ngPass', role: 'student', memberId: 'NEW-001', departmentId: 1 });
    expect(r.status).toBe(201);
    expect(r.body.data.token).toBeTruthy();
    expect(r.body.data.user.role).toBe('student');
    expect(JSON.stringify(r.body)).not.toContain('password_hash');
    const [row] = await query<{ password_hash: string }>("SELECT password_hash FROM users WHERE email = 'new@test.edu'");
    expect(row.password_hash).toMatch(/^\$2[aby]\$/); // bcrypt, never plain text
    expect(row.password_hash).not.toContain('Str0ngPass');
  });
  it('rejects duplicate e-mail (409), weak password and admin self-registration (400)', async () => {
    const base = { fullName: 'Dup', email: 'new@test.edu', password: 'Str0ngPass', role: 'student', memberId: 'DUP-1', departmentId: 1 };
    expect((await api.post('/api/auth/register').send(base)).status).toBe(409);
    expect((await api.post('/api/auth/register').send({ ...base, email: 'x@test.edu', password: 'weak' })).status).toBe(400);
    expect((await api.post('/api/auth/register').send({ ...base, email: 'y@test.edu', role: 'admin' })).status).toBe(400);
  });
  it('logs in with correct credentials, rejects wrong ones with a safe message', async () => {
    const bad = await api.post('/api/auth/login').send({ email: 'student@test.edu', password: 'Wrong123' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.message).toBe('Incorrect email or password');
    const unknown = await api.post('/api/auth/login').send({ email: 'ghost@test.edu', password: 'Wrong123' });
    expect(unknown.body.error.message).toBe(bad.body.error.message); // no user enumeration
    const me = await api.get('/api/auth/me').set(auth(tokens.student));
    expect(me.body.data.email).toBe('student@test.edu');
  });
  it('logout revokes the token server-side', async () => {
    const t = await login('faculty@test.edu', 'Passw0rd!');
    expect((await api.get('/api/auth/me').set(auth(t))).status).toBe(200);
    expect((await api.post('/api/auth/logout').set(auth(t))).status).toBe(200);
    expect((await api.get('/api/auth/me').set(auth(t))).status).toBe(401);
  });
  it('password reset flow works end to end', async () => {
    const f = await api.post('/api/auth/forgot-password').send({ email: 'new@test.edu' });
    expect(f.status).toBe(200);
    const token = f.body.data.devResetToken as string;
    expect(token).toBeTruthy();
    const [stored] = await query<{ token_hash: string }>('SELECT token_hash FROM password_reset_tokens ORDER BY id DESC LIMIT 1');
    expect(stored.token_hash).not.toBe(token); // only the hash is stored
    expect((await api.post('/api/auth/reset-password').send({ token, password: 'Brand9NewPw' })).status).toBe(200);
    expect((await api.post('/api/auth/reset-password').send({ token, password: 'Another9Pw' })).status).toBe(400); // single-use
    await login('new@test.edu', 'Brand9NewPw');
  });
});

describe('role-based access control (enforced by the API, not the UI)', () => {
  it('blocks unauthenticated requests', async () => {
    expect((await api.get('/api/resources')).status).toBe(401);
  });
  it('blocks a student from every admin endpoint', async () => {
    for (const [m, p] of [['get', '/api/admin/users'], ['get', '/api/admin/analytics/overview'], ['get', '/api/admin/audit/activity'], ['get', '/api/admin/settings'], ['get', '/api/maintenance'], ['get', '/api/bookings/stats'], ['get', '/api/equipment']] as const) {
      const r = await api[m](p).set(auth(tokens.student));
      expect(r.status, p).toBe(403);
    }
    expect((await api.post('/api/resources').set(auth(tokens.student)).send({})).status).toBe(403);
    expect((await api.post('/api/bookings/1/decision').set(auth(tokens.student)).send({ decision: 'approved' })).status).toBe(403);
    expect((await api.get('/api/admin/users').set(auth(tokens.faculty))).status).toBe(403);
    expect((await api.get('/api/admin/users').set(auth(tokens.admin))).status).toBe(200);
  });
});

describe('resources', () => {
  it('admin creates, updates, lists, searches and deletes a resource', async () => {
    const body = { code: 'LAB-NEW', name: 'Quantum Computing Lab', categoryId: 1, buildingId: 1, roomNumber: 'Q-1', floorNo: 2, departmentId: 1, capacity: 20, description: 'New lab', requiresApproval: true };
    const c = await api.post('/api/resources').set(auth(tokens.admin)).send(body);
    expect(c.status).toBe(201);
    const id = c.body.data.id;
    const l = await api.get('/api/resources?q=Quantum').set(auth(tokens.student));
    expect(l.body.data.map((r: { id: number }) => r.id)).toContain(id);
    expect((await api.put(`/api/resources/${id}`).set(auth(tokens.admin)).send({ ...body, capacity: 25 })).body.data.capacity).toBe(25);
    expect((await api.post('/api/resources').set(auth(tokens.admin)).send({ ...body, capacity: 0 })).status).toBe(400);
    expect((await api.post('/api/resources').set(auth(tokens.admin)).send(body)).status).toBe(409); // duplicate code
    const del = await api.delete(`/api/resources/${id}`).set(auth(tokens.admin));
    expect(del.body.data.deleted).toBe(true);
    expect((await api.get(`/api/resources/${id}`).set(auth(tokens.admin))).status).toBe(404);
  });
});

describe('bookings: lifecycle, approval, cancellation', () => {
  let bookingId = 0;
  it('student creates a booking that needs approval; trigger writes notifications', async () => {
    const r = await api.post('/api/bookings').set(auth(tokens.student)).send({ resourceId: ids.lab, ...slot(D, '10:00', '12:00'), purpose: 'Project work session', attendees: 5 });
    expect(r.status).toBe(201);
    expect(r.body.data.status).toBe('pending');
    bookingId = r.body.data.id;
    const n = await query<{ user_id: number; type: string }>('SELECT user_id, type FROM notifications WHERE booking_id = ?', [bookingId]);
    expect(n.some((x) => x.user_id === ids.student && x.type === 'booking_created')).toBe(true);
    expect(n.some((x) => x.user_id === ids.admin)).toBe(true); // admin told about the pending request
  });
  it('auto-approves resources that do not need approval', async () => {
    const r = await api.post('/api/bookings').set(auth(tokens.student)).send({ resourceId: ids.openRoom, ...slot(D, '09:00', '10:00'), purpose: 'Pair programming', attendees: 2 });
    expect(r.body.data.status).toBe('approved');
    expect(r.body.data.decision).toBe('auto_approved');
  });
  it('enforces business rules (past, duration, capacity, hours)', async () => {
    const mk = (extra: object) => api.post('/api/bookings').set(auth(tokens.student)).send({ resourceId: ids.openRoom, ...slot(day(4), '10:00', '11:00'), purpose: 'Rule check', attendees: 2, ...extra });
    expect((await mk({ startTime: '2020-01-01T10:00', endTime: '2020-01-01T11:00' })).status).toBe(422);
    expect((await mk(slot(day(4), '10:00', '15:00'))).body.error.code).toBe('DURATION_EXCEEDED');
    expect((await mk({ attendees: 50 })).body.error.code).toBe('CAPACITY_EXCEEDED');
    expect((await mk(slot(day(4), '05:00', '06:00'))).body.error.code).toBe('OUTSIDE_HOURS');
    expect((await mk({ purpose: 'x' })).status).toBe(400);
  });
  it('another student cannot read or cancel it', async () => {
    const other = await login('racer1@test.edu', 'Passw0rd!');
    expect((await api.get(`/api/bookings/${bookingId}`).set(auth(other))).status).toBe(404);
    expect((await api.post(`/api/bookings/${bookingId}/cancel`).set(auth(other)).send({})).status).toBe(403);
  });
  it('owner edits a pending booking', async () => {
    const r = await api.put(`/api/bookings/${bookingId}`).set(auth(tokens.student)).send({ ...slot(D, '10:00', '11:30'), purpose: 'Project work (shortened)', attendees: 4 });
    expect(r.status).toBe(200);
    expect(r.body.data.endTime).toContain('11:30');
  });
  it('admin approves; student is notified; status history is recorded', async () => {
    expect((await api.post(`/api/bookings/${bookingId}/decision`).set(auth(tokens.admin)).send({ decision: 'rejected' })).status).toBe(400); // reason required
    const r = await api.post(`/api/bookings/${bookingId}/decision`).set(auth(tokens.admin)).send({ decision: 'approved', remarks: 'Go ahead' });
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('approved');
    expect((await api.post(`/api/bookings/${bookingId}/decision`).set(auth(tokens.admin)).send({ decision: 'approved' })).status).toBe(409); // already decided
    const notes = await api.get('/api/notifications').set(auth(tokens.student));
    expect(notes.body.data.some((n: { type: string }) => n.type === 'booking_approved')).toBe(true);
    const d = await api.get(`/api/bookings/${bookingId}`).set(auth(tokens.student));
    expect(d.body.data.history.map((h: { newStatus: string }) => h.newStatus)).toEqual(['pending', 'approved']);
  });
  it('owner cancels; slot becomes free again; closed booking cannot be re-opened', async () => {
    const c = await api.post(`/api/bookings/${bookingId}/cancel`).set(auth(tokens.student)).send({ reason: 'Not needed' });
    expect(c.body.data.status).toBe('cancelled');
    expect((await api.post(`/api/bookings/${bookingId}/cancel`).set(auth(tokens.student)).send({})).status).toBe(409);
    const again = await api.post('/api/bookings').set(auth(tokens.faculty)).send({ resourceId: ids.lab, ...slot(D, '10:00', '12:00'), purpose: 'Faculty workshop', attendees: 20 });
    expect(again.status).toBe(201);
    await expect(execute("UPDATE bookings SET status = 'approved' WHERE id = ?", [bookingId])).rejects.toMatchObject({ sqlMessage: expect.stringContaining('INVALID_STATE') });
  });
  it('persists in MySQL', async () => {
    const [row] = await query<{ status: string }>('SELECT status FROM bookings WHERE id = ?', [bookingId]);
    expect(row.status).toBe('cancelled');
  });
});

describe('double-booking prevention (database level)', () => {
  const dd = day(6);
  it('rejects an overlapping booking, accepts a back-to-back one', async () => {
    const mk = (t: string, a: string, b: string) => api.post('/api/bookings').set(auth(tokens.student)).send({ resourceId: ids.openRoom, ...slot(dd, a, b), purpose: 'Overlap test', attendees: 2 });
    expect((await mk(tokens.student, '14:00', '16:00')).status).toBe(201);
    for (const [a, b] of [['14:00', '16:00'], ['15:00', '17:00'], ['13:00', '14:30'], ['14:30', '15:00']]) {
      const r = await mk(tokens.student, a, b);
      expect(r.status, `${a}-${b}`).toBe(409);
      expect(r.body.error.code).toBe('BOOKING_CONFLICT');
    }
    expect((await mk(tokens.student, '16:00', '17:00')).status).toBe(201); // touching boundary is allowed
    expect((await mk(tokens.student, '13:00', '14:00')).status).toBe(201);
  });
  it('raw SQL INSERT bypassing the API is also blocked by the trigger', async () => {
    await expect(execute(`INSERT INTO bookings (resource_id, user_id, start_time, end_time, purpose, attendees, status)
       VALUES (?, ?, ?, ?, 'direct insert', 1, 'approved')`, [ids.openRoom, ids.student, `${dd} 14:30:00`, `${dd} 15:30:00`]))
      .rejects.toMatchObject({ sqlMessage: expect.stringContaining('BOOKING_CONFLICT') });
  });
  it('8 simultaneous requests for the same slot: exactly one wins', async () => {
    const dc = day(8);
    const toks = await Promise.all(Array.from({ length: 8 }, (_, i) => login(`racer${i + 1}@test.edu`, 'Passw0rd!')));
    const results = await Promise.all(toks.map((t) => api.post('/api/bookings').set(auth(t)).send({ resourceId: ids.lab, ...slot(dc, '15:00', '17:00'), purpose: 'Race condition test', attendees: 3 })));
    const codes = results.map((r) => r.status);
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(7);
    const [{ n }] = await query<{ n: number }>("SELECT COUNT(*) AS n FROM bookings WHERE resource_id = ? AND start_time = ? AND status IN ('pending','approved')", [ids.lab, `${dc} 15:00:00`]);
    expect(Number(n)).toBe(1);
  });
  it('a recurring class in the timetable blocks ad-hoc bookings', async () => {
    const r = await api.post('/api/bookings').set(auth(tokens.faculty)).send({ resourceId: ids.classRoom, ...slot(day(5), '11:00', '12:30'), purpose: 'Clashes with CS999', attendees: 10 });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('CLASS_SCHEDULE');
    expect((await api.post('/api/bookings').set(auth(tokens.faculty)).send({ resourceId: ids.classRoom, ...slot(day(5), '13:00', '14:00'), purpose: 'Free slot', attendees: 10 })).status).toBe(201);
  });
});

describe('maintenance restrictions', () => {
  const dm = day(10);
  let maintId = 0; let victim = 0;
  it('existing bookings are auto-cancelled and the owner is notified when maintenance starts', async () => {
    const b = await api.post('/api/bookings').set(auth(tokens.student)).send({ resourceId: ids.openRoom, ...slot(dm, '10:00', '11:00'), purpose: 'Will be cancelled', attendees: 2 });
    victim = b.body.data.id;
    const m = await api.post('/api/maintenance').set(auth(tokens.admin)).send({ resourceId: ids.openRoom, title: 'Projector rewiring', priority: 'high', status: 'open', startsAt: `${dm}T08:00`, expectedEnd: `${dm}T20:00` });
    expect(m.status).toBe(201);
    expect(m.body.data.cancelledBookings).toBe(1);
    maintId = m.body.data.id;
    const d = await api.get(`/api/bookings/${victim}`).set(auth(tokens.student));
    expect(d.body.data.status).toBe('cancelled');
    expect(d.body.data.cancelReason).toContain('maintenance');
  });
  it('new bookings during the window are blocked, bookings after it are fine', async () => {
    const r = await api.post('/api/bookings').set(auth(tokens.student)).send({ resourceId: ids.openRoom, ...slot(dm, '12:00', '13:00'), purpose: 'During maintenance', attendees: 2 });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('MAINTENANCE');
    expect((await api.post('/api/bookings').set(auth(tokens.student)).send({ resourceId: ids.openRoom, ...slot(day(12), '12:00', '13:00'), purpose: 'After maintenance', attendees: 2 })).status).toBe(201);
  });
  it('resolving the request reopens the resource', async () => {
    expect((await api.patch(`/api/maintenance/${maintId}`).set(auth(tokens.admin)).send({ status: 'resolved' })).status).toBe(200);
    const r = await api.post('/api/bookings').set(auth(tokens.student)).send({ resourceId: ids.openRoom, ...slot(dm, '12:00', '13:00'), purpose: 'After resolution', attendees: 2 });
    expect(r.status).toBe(201);
  });
  it('students can report an issue (does not block) but cannot manage requests', async () => {
    const r = await api.post('/api/maintenance/report').set(auth(tokens.student)).send({ resourceId: ids.lab, title: 'Projector flickers', priority: 'low' });
    expect(r.status).toBe(201);
    expect(r.body.data.status).toBe('reported');
    expect((await api.patch(`/api/maintenance/${r.body.data.id}`).set(auth(tokens.student)).send({ status: 'open' })).status).toBe(403);
  });
});

describe('admin analytics from real queries', () => {
  it('overview, trends, popular, utilisation and CSV export', async () => {
    const o = await api.get('/api/admin/analytics/overview').set(auth(tokens.admin));
    const [{ n }] = await query<{ n: number }>('SELECT COUNT(*) AS n FROM bookings');
    expect(o.body.data.totals.bookings).toBe(Number(n));
    expect(o.body.data.totals.users).toBeGreaterThanOrEqual(12);
    expect((await api.get('/api/admin/analytics/trends').set(auth(tokens.admin))).body.data).toHaveLength(12);
    expect((await api.get('/api/admin/analytics/popular').set(auth(tokens.admin))).status).toBe(200);
    const u = await api.get('/api/admin/analytics/utilization').set(auth(tokens.admin));
    expect(u.body.data.length).toBeGreaterThan(0);
    const csv = await api.get(`/api/admin/reports/bookings.csv?from=${day(0)}&to=${day(30)}`).set(auth(tokens.admin));
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Booking Code');
  });
});

describe('MongoDB: audit, activity and notification history', () => {
  it('login/booking events were actually written to MongoDB and can be retrieved', async () => {
    await sleep(500); await flushPending();
    expect(await ActivityLog.countDocuments({ action: 'auth.login' })).toBeGreaterThan(0);
    expect(await ActivityLog.countDocuments({ action: 'auth.login_failed' })).toBeGreaterThan(0);
    expect(await BookingAudit.countDocuments({ event: 'created' })).toBeGreaterThan(0);
    expect(await BookingAudit.countDocuments({ event: 'conflict_blocked' })).toBeGreaterThan(0);
    const r = await api.get('/api/admin/audit/activity?category=auth').set(auth(tokens.admin));
    expect(r.status).toBe(200);
    expect(r.body.data.length).toBeGreaterThan(0);
    expect(r.body.meta.total).toBeGreaterThan(0);
    const b = await api.get('/api/admin/audit/bookings?event=approved').set(auth(tokens.admin));
    expect(b.body.data.length).toBeGreaterThan(0);
  });
  it('MySQL notifications are copied to MongoDB notification_history (outbox sync)', async () => {
    await execute("INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'system', 'Outbox probe', 'written directly to MySQL')", [ids.student]);
    const copied = await syncNotificationHistory();
    expect(copied).toBeGreaterThan(0);
    expect(await NotificationHistory.countDocuments({ title: 'Outbox probe' })).toBe(1);
    const [{ n }] = await query<{ n: number }>('SELECT COUNT(*) AS n FROM notifications WHERE mongo_synced = 0');
    expect(Number(n)).toBe(0);
    const h = await api.get('/api/notifications/history').set(auth(tokens.student));
    expect(h.status).toBe(200);
    expect(h.body.data.length).toBeGreaterThan(0);
  });
  it('degrades gracefully when MongoDB is down, and recovers', async () => {
    await disconnectMongo();
    expect(mongoState.connected).toBe(false);
    const l = await api.post('/api/auth/login').send({ email: 'student@test.edu', password: 'Passw0rd!' });
    expect(l.status).toBe(200); // core app unaffected
    const b = await api.post('/api/bookings').set(auth(tokens.student)).send({ resourceId: ids.openRoom, ...slot(day(14), '09:00', '10:00'), purpose: 'Mongo is offline', attendees: 2 });
    expect(b.status).toBe(201);
    const audit = await api.get('/api/admin/audit/activity').set(auth(tokens.admin));
    expect(audit.status).toBe(503);
    expect(audit.body.error.code).toBe('MONGO_UNAVAILABLE');
    expect(mongoState.queued).toBeGreaterThan(0); // events held in memory
    const before = await ActivityLog.countDocuments().catch(() => -1);
    expect(before).toBe(-1);
    await connectMongo(); await sleep(500); await flushPending();
    expect(mongoState.queued).toBe(0);
    expect(await BookingAudit.countDocuments({ bookingId: b.body.data.id })).toBe(1); // queued event delivered after reconnect
  });
});

describe('settings & validation', () => {
  it('admin updates settings; invalid values rejected', async () => {
    expect((await api.put('/api/admin/settings').set(auth(tokens.admin)).send({ max_hours_student: '4' })).status).toBe(200);
    expect((await api.put('/api/admin/settings').set(auth(tokens.admin)).send({ max_hours_student: '99' })).status).toBe(400);
    expect((await api.put('/api/admin/settings').set(auth(tokens.admin)).send({ nonsense: '1' })).status).toBe(400);
    await api.put('/api/admin/settings').set(auth(tokens.admin)).send({ max_hours_student: '3' });
  });
  it('SQL-injection style input is treated as data', async () => {
    const r = await api.get("/api/resources?q=' OR 1=1; DROP TABLE users;--").set(auth(tokens.admin));
    expect(r.status).toBe(200);
    expect(r.body.data).toHaveLength(0);
    expect((await query('SELECT COUNT(*) AS n FROM users'))[0]).toBeTruthy();
  });
});
