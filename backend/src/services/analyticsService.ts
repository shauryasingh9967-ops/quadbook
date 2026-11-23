import { RowDataPacket } from 'mysql2/promise';
import { query, queryOne, withConnection } from '../db/mysql';
import { mapRows } from '../utils/mapper';
import { getScheduleEvents } from './resourceService';

const n = (v: unknown) => Number(v ?? 0);
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const defaultRange = (days = 30) => { const to = new Date(); const from = new Date(); from.setDate(to.getDate() - (days - 1)); return { from: ymd(from), to: ymd(to) }; };

export async function utilization(from: string, to: string) {
  const rows = await withConnection(async (conn) => {
    const [res] = await conn.query<RowDataPacket[][]>('CALL sp_resource_utilization(?, ?)', [from, to]);
    return res[0] as RowDataPacket[];
  });
  return mapRows(rows);
}

export async function monthlyTrends(months = 12) {
  const rows = await query<RowDataPacket>(
    `SELECT * FROM v_monthly_booking_trends WHERE month_key >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL ? MONTH), '%Y-%m') ORDER BY month_key`, [months - 1]);
  const map = new Map(rows.map((r) => [r.month_key as string, r]));
  const out = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const r = map.get(key);
    out.push({
      month: key, label: d.toLocaleString('en-US', { month: 'short' }),
      total: n(r?.total), approved: n(r?.approved), rejected: n(r?.rejected), cancelled: n(r?.cancelled), pending: n(r?.pending),
    });
  }
  return out;
}

export async function popularResources(limit = 8) {
  return mapRows(await query('SELECT * FROM v_popular_resources WHERE total_bookings > 0 ORDER BY popularity_rank, name LIMIT ?', [limit]));
}

export async function adminOverview() {
  const [users, resources, bookings, maint, today, avg] = await Promise.all([
    query<RowDataPacket>('SELECT r.name AS role, COUNT(*) AS c FROM users u JOIN roles r ON r.id = u.role_id GROUP BY r.name'),
    query<RowDataPacket>('SELECT status, COUNT(*) AS c FROM resources GROUP BY status'),
    query<RowDataPacket>('SELECT status, COUNT(*) AS c FROM bookings GROUP BY status'),
    queryOne<RowDataPacket>("SELECT SUM(status IN ('reported')) AS reported, SUM(status IN ('open','in_progress')) AS active FROM maintenance_requests"),
    queryOne<RowDataPacket>("SELECT COUNT(*) AS c FROM bookings WHERE DATE(start_time) = CURDATE() AND status IN ('approved','pending','completed')"),
    utilization(defaultRange(30).from, defaultRange(30).to),
  ]);
  const by = (rows: RowDataPacket[], k: string) => Object.fromEntries(rows.map((r) => [r[k], n(r.c)])) as Record<string, number>;
  const u = by(users, 'role'); const rs = by(resources, 'status'); const b = by(bookings, 'status');
  const totalBookings = Object.values(b).reduce((a, c) => a + c, 0);
  const utilRows = avg as Array<{ utilizationPct: number }>;
  return {
    totals: {
      users: Object.values(u).reduce((a, c) => a + c, 0), students: u.student ?? 0, faculty: u.faculty ?? 0, admins: u.admin ?? 0,
      resources: Object.values(rs).reduce((a, c) => a + c, 0), resourcesUnderMaintenance: rs.maintenance ?? 0,
      bookings: totalBookings, bookingsToday: n(today?.c),
    },
    bookings: { pending: b.pending ?? 0, approved: (b.approved ?? 0) + (b.completed ?? 0), rejected: b.rejected ?? 0, cancelled: b.cancelled ?? 0, completed: b.completed ?? 0 },
    approvalRate: (() => { const dec = (b.approved ?? 0) + (b.completed ?? 0) + (b.rejected ?? 0); return dec ? Math.round(((((b.approved ?? 0) + (b.completed ?? 0)) / dec) * 1000)) / 10 : 0; })(),
    maintenance: { reported: n(maint?.reported), active: n(maint?.active) },
    averageUtilization: utilRows.length ? Math.round((utilRows.reduce((a, r) => a + n(r.utilizationPct), 0) / utilRows.length) * 10) / 10 : 0,
  };
}

export async function reportsBundle(from: string, to: string) {
  const [util, byCategory, byDepartment, byHour, byWeekday, topUsers, statusSplit] = await Promise.all([
    utilization(from, to),
    query(`SELECT c.name AS category, COUNT(b.id) AS bookings, COALESCE(SUM(fn_booking_hours(b.start_time,b.end_time)),0) AS hours
             FROM bookings b JOIN resources r ON r.id=b.resource_id JOIN resource_categories c ON c.id=r.category_id
            WHERE b.status IN ('approved','completed') AND DATE(b.start_time) BETWEEN ? AND ? GROUP BY c.name ORDER BY bookings DESC`, [from, to]),
    query(`SELECT COALESCE(d.name,'Unassigned') AS department, COUNT(b.id) AS bookings
             FROM bookings b JOIN users u ON u.id=b.user_id LEFT JOIN departments d ON d.id=u.department_id
            WHERE b.status IN ('approved','completed') AND DATE(b.start_time) BETWEEN ? AND ? GROUP BY d.name ORDER BY bookings DESC`, [from, to]),
    query(`SELECT HOUR(start_time) AS hour, COUNT(*) AS bookings FROM bookings
            WHERE status IN ('approved','completed') AND DATE(start_time) BETWEEN ? AND ? GROUP BY HOUR(start_time) ORDER BY hour`, [from, to]),
    query(`SELECT WEEKDAY(start_time) AS dow, COUNT(*) AS bookings FROM bookings
            WHERE status IN ('approved','completed') AND DATE(start_time) BETWEEN ? AND ? GROUP BY WEEKDAY(start_time) ORDER BY dow`, [from, to]),
    query(`SELECT u.full_name, rl.name AS role, COUNT(b.id) AS bookings, COALESCE(SUM(fn_booking_hours(b.start_time,b.end_time)),0) AS hours,
                  DENSE_RANK() OVER (ORDER BY COUNT(b.id) DESC) AS rank_no
             FROM bookings b JOIN users u ON u.id=b.user_id JOIN roles rl ON rl.id=u.role_id
            WHERE b.status IN ('approved','completed') AND DATE(b.start_time) BETWEEN ? AND ? GROUP BY u.id, u.full_name, rl.name
            ORDER BY bookings DESC, hours DESC LIMIT 10`, [from, to]),
    query('SELECT status, COUNT(*) AS bookings FROM bookings WHERE DATE(start_time) BETWEEN ? AND ? GROUP BY status', [from, to]),
  ]);
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, bookings: n((byHour as RowDataPacket[]).find((r) => r.hour === h)?.bookings) })).filter((h) => h.hour >= 7 && h.hour <= 20);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => ({ day: d, bookings: n((byWeekday as RowDataPacket[]).find((r) => r.dow === i)?.bookings) }));
  const total = (rows: unknown[]) => rows.reduce<number>((a, r) => a + n((r as { bookings: number }).bookings), 0);
  return {
    range: { from, to }, utilization: util, byCategory: mapRows(byCategory), byDepartment: mapRows(byDepartment),
    byHour: hours, byWeekday: days, topUsers: mapRows(topUsers), statusSplit: mapRows(statusSplit),
    totals: { approvedBookings: total(byCategory), hours: Math.round((byCategory as RowDataPacket[]).reduce((a, r) => a + n(r.hours), 0) * 10) / 10 },
  };
}

export async function myOverview(userId: number) {
  const [counts, upcoming, hours, unread, recent] = await Promise.all([
    query<RowDataPacket>('SELECT status, COUNT(*) AS c FROM bookings WHERE user_id = ? GROUP BY status', [userId]),
    query(`SELECT * FROM v_booking_details WHERE user_id = ? AND status IN ('pending','approved') AND end_time >= NOW() ORDER BY start_time LIMIT 5`, [userId]),
    queryOne<RowDataPacket>(`SELECT COALESCE(SUM(fn_booking_hours(start_time,end_time)),0) AS h FROM bookings
                              WHERE user_id = ? AND status IN ('approved','completed') AND DATE_FORMAT(start_time,'%Y-%m') = DATE_FORMAT(CURDATE(),'%Y-%m')`, [userId]),
    queryOne<RowDataPacket>('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0', [userId]),
    query('SELECT * FROM v_booking_details WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 5', [userId]),
  ]);
  const c = Object.fromEntries(counts.map((r) => [r.status, n(r.c)])) as Record<string, number>;
  return {
    counts: { pending: c.pending ?? 0, approved: c.approved ?? 0, completed: c.completed ?? 0, rejected: c.rejected ?? 0, cancelled: c.cancelled ?? 0,
              total: Object.values(c).reduce((a, x) => a + x, 0) },
    hoursThisMonth: n(hours?.h), unreadNotifications: n(unread?.c),
    upcoming: mapRows(upcoming), recent: mapRows(recent),
  };
}

export async function publicStats() {
  const [r] = await query<RowDataPacket>(`SELECT
      (SELECT COUNT(*) FROM resources WHERE status <> 'retired') AS resources,
      (SELECT COUNT(*) FROM buildings) AS buildings,
      (SELECT COUNT(*) FROM users WHERE status = 'active') AS users,
      (SELECT COUNT(*) FROM bookings WHERE status IN ('approved','completed')) AS bookings,
      (SELECT COALESCE(SUM(fn_booking_hours(start_time,end_time)),0) FROM bookings WHERE status IN ('approved','completed')) AS hours`);
  return { resources: n(r.resources), buildings: n(r.buildings), users: n(r.users), bookings: n(r.bookings), hours: Math.round(n(r.hours)) };
}

export async function publicResources(limit = 6) {
  return mapRows(await query(
    `SELECT id, code, name, capacity, status, category_name, category_kind, category_icon, building_name, room_number, equipment_count
       FROM v_resource_catalog WHERE status <> 'retired' ORDER BY upcoming_bookings DESC, name LIMIT ?`, [limit]));
}

/** Today's occupancy ribbons for the landing page (anonymous: no names, no purposes). */
export async function publicAvailability(limit = 5) {
  const today = ymd(new Date());
  const rows = await query<RowDataPacket>(
    `SELECT id, name, category_name, category_kind, building_name, room_number, capacity
       FROM v_resource_catalog WHERE status <> 'retired' AND category_kind IN ('lab','hall','classroom')
      ORDER BY upcoming_bookings DESC, name LIMIT ?`, [limit]);
  const resources = [];
  for (const r of rows) {
    const events = await getScheduleEvents(r.id, today, today, { id: 0, role: 'student', email: '', name: '', jti: '', exp: 0 });
    resources.push({
      id: r.id, name: r.name, category: r.category_name, building: r.building_name, room: r.room_number, capacity: r.capacity,
      slots: events.map((e) => ({ type: e.type, start: e.start, end: e.end })),
    });
  }
  const startHour = (await queryOne<RowDataPacket>("SELECT setting_value AS v FROM system_settings WHERE setting_key = 'day_start_hour'"))?.v ?? '8';
  const endHour = (await queryOne<RowDataPacket>("SELECT setting_value AS v FROM system_settings WHERE setting_key = 'day_end_hour'"))?.v ?? '20';
  return { date: today, startHour: Number(startHour), endHour: Number(endHour), resources };
}
