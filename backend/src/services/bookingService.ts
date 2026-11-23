import { RowDataPacket } from 'mysql2/promise';
import { query, queryOne, withConnection, execute } from '../db/mysql';
import { ApiError } from '../utils/apiError';
import { mapRow, mapRows, toSqlDateTime } from '../utils/mapper';
import { Page } from '../utils/http';
import { AuthUser } from '../types/express';
import { logBookingEvent } from './auditService';
import { syncSoon } from './notificationService';

const CONFLICT_CODES = new Set(['BOOKING_CONFLICT', 'MAINTENANCE', 'CLASS_SCHEDULE']);
const actorOf = (u: AuthUser) => ({ id: u.id, name: u.name, role: u.role });

export async function getBookingRow(id: number) {
  const row = await queryOne('SELECT *, (start_time > NOW()) AS is_future FROM v_booking_details WHERE id = ?', [id]);
  return row ? mapRow<Record<string, unknown>>(row) : null;
}

export async function createBooking(user: AuthUser, b: {
  resourceId: number; startTime: string; endTime: string; purpose: string; attendees: number;
  equipment?: Array<{ equipmentId: number; quantity: number }>;
}) {
  let result: { id: number; status: string };
  try {
    result = await withConnection(async (conn) => {
      await conn.query('CALL sp_create_booking(?, ?, ?, ?, ?, ?, ?, @bid, @bst)', [
        user.id, b.resourceId, toSqlDateTime(b.startTime), toSqlDateTime(b.endTime), b.purpose, b.attendees,
        b.equipment?.length ? JSON.stringify(b.equipment) : null,
      ]);
      const [rows] = await conn.query<RowDataPacket[]>('SELECT @bid AS id, @bst AS status');
      return { id: Number(rows[0].id), status: String(rows[0].status) };
    });
  } catch (e) {
    const msg = (e as { sqlMessage?: string }).sqlMessage ?? '';
    const code = /^([A-Z_]+):/.exec(msg)?.[1];
    if (code && CONFLICT_CODES.has(code)) {
      logBookingEvent({ event: 'conflict_blocked', actor: actorOf(user), resourceId: b.resourceId, note: `${code}: ${b.startTime} -> ${b.endTime}` });
    }
    throw e;
  }
  const booking = await getBookingRow(result.id);
  logBookingEvent({ event: 'created', booking, actor: actorOf(user), note: result.status === 'approved' ? 'auto-approved' : 'awaiting approval' });
  syncSoon();
  return booking!;
}

export interface BookingFilters {
  status?: string; scope?: 'upcoming' | 'history'; q?: string; resourceId?: number; userId?: number;
  kind?: string; from?: string; to?: string; sort?: 'newest' | 'start_asc' | 'start_desc';
}
const SORT: Record<string, string> = { newest: 'created_at DESC, id DESC', start_asc: 'start_time ASC', start_desc: 'start_time DESC' };

export async function listBookings(user: AuthUser, f: BookingFilters, p: Page) {
  const where: string[] = []; const params: unknown[] = [];
  if (user.role !== 'admin') { where.push('user_id = ?'); params.push(user.id); }
  else if (f.userId) { where.push('user_id = ?'); params.push(f.userId); }
  if (f.status) { const s = f.status.split(',').filter(Boolean); where.push(`status IN (${s.map(() => '?').join(',')})`); params.push(...s); }
  if (f.scope === 'upcoming') where.push("end_time >= NOW() AND status IN ('pending','approved')");
  if (f.scope === 'history') where.push("(status IN ('completed','cancelled','rejected') OR end_time < NOW())");
  if (f.q) { where.push('(booking_code LIKE ? OR resource_name LIKE ? OR purpose LIKE ? OR user_name LIKE ?)'); const l = `%${f.q}%`; params.push(l, l, l, l); }
  if (f.resourceId) { where.push('resource_id = ?'); params.push(f.resourceId); }
  if (f.kind) { where.push('category_kind = ?'); params.push(f.kind); }
  if (f.from) { where.push('DATE(start_time) >= ?'); params.push(f.from); }
  if (f.to) { where.push('DATE(start_time) <= ?'); params.push(f.to); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const order = SORT[f.sort ?? (f.scope === 'upcoming' ? 'start_asc' : 'start_desc')];
  const rows = await query(`SELECT * FROM v_booking_details ${w} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, p.limit, p.offset]);
  const c = await queryOne<RowDataPacket>(`SELECT COUNT(*) AS c FROM v_booking_details ${w}`, params);
  return { items: mapRows(rows), total: Number(c?.c ?? 0) };
}

export async function bookingStatusCounts() {
  const rows = await query<RowDataPacket>('SELECT status, COUNT(*) AS c FROM bookings GROUP BY status');
  const out: Record<string, number> = { pending: 0, approved: 0, rejected: 0, cancelled: 0, completed: 0 };
  rows.forEach((r) => { out[r.status] = Number(r.c); });
  return out;
}

export async function getBookingDetail(user: AuthUser, id: number) {
  const b = await getBookingRow(id);
  if (!b || (user.role !== 'admin' && b.userId !== user.id)) throw ApiError.notFound('Booking not found');
  const [equipment, history] = await Promise.all([
    query(`SELECT e.id, e.name, e.asset_tag, be.quantity FROM booking_equipment be JOIN equipment e ON e.id = be.equipment_id WHERE be.booking_id = ?`, [id]),
    query(`SELECT h.id, h.old_status, h.new_status, h.changed_at, u.full_name AS changed_by_name
             FROM booking_status_history h LEFT JOIN users u ON u.id = h.changed_by WHERE h.booking_id = ? ORDER BY h.changed_at, h.id`, [id]),
  ]);
  const isOwner = b.userId === user.id;
  return {
    ...b,
    equipment: mapRows(equipment), history: mapRows(history),
    canEdit: isOwner && b.status === 'pending',
    canCancel: ['pending', 'approved'].includes(String(b.status)) && (user.role === 'admin' || (isOwner && Boolean(b.isFuture))),
    canDecide: user.role === 'admin' && b.status === 'pending',
  };
}

export async function updateBooking(user: AuthUser, id: number, b: { startTime: string; endTime: string; purpose: string; attendees: number }) {
  await withConnection((conn) => conn.query('CALL sp_update_booking(?, ?, ?, ?, ?, ?)', [id, user.id, toSqlDateTime(b.startTime), toSqlDateTime(b.endTime), b.purpose, b.attendees]));
  const row = await getBookingRow(id);
  logBookingEvent({ event: 'updated', booking: row, actor: actorOf(user) });
  return row!;
}

export async function cancelBooking(user: AuthUser, id: number, reason?: string) {
  await withConnection((conn) => conn.query('CALL sp_cancel_booking(?, ?, ?)', [id, user.id, reason ?? null]));
  const row = await getBookingRow(id);
  logBookingEvent({ event: 'cancelled', booking: row, actor: actorOf(user), note: reason });
  syncSoon();
  return row!;
}

export async function decideBooking(user: AuthUser, id: number, decision: 'approved' | 'rejected', remarks?: string) {
  await withConnection((conn) => conn.query('CALL sp_decide_booking(?, ?, ?, ?)', [id, user.id, decision, remarks ?? null]));
  const row = await getBookingRow(id);
  logBookingEvent({ event: decision === 'approved' ? 'approved' : 'rejected', booking: row, actor: actorOf(user), note: remarks });
  syncSoon();
  return row!;
}

export async function runHousekeeping() {
  const r = await withConnection(async (conn) => {
    const [res] = await conn.query<RowDataPacket[][]>('CALL sp_housekeeping()');
    return (res[0] as RowDataPacket[])[0] as { completed_bookings: number; expired_bookings: number };
  });
  return r;
}
export { execute };
