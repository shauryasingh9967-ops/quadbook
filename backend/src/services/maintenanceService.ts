import { RowDataPacket } from 'mysql2/promise';
import { execute, query, queryOne, withTransaction } from '../db/mysql';
import { ApiError } from '../utils/apiError';
import { mapRow, mapRows, toSqlDateTime } from '../utils/mapper';
import { Page } from '../utils/http';
import { AuthUser } from '../types/express';
import { logBookingEvent } from './auditService';
import { syncSoon } from './notificationService';

const BLOCKING = ['open', 'in_progress'];
const SELECT = `SELECT m.id, m.resource_id, m.title, m.description, m.priority, m.status, m.starts_at, m.expected_end,
       m.resolved_at, m.created_at, m.reported_by, m.assigned_to,
       r.name AS resource_name, r.code AS resource_code, rep.full_name AS reported_by_name, asg.full_name AS assigned_to_name
  FROM maintenance_requests m JOIN resources r ON r.id = m.resource_id
  LEFT JOIN users rep ON rep.id = m.reported_by LEFT JOIN users asg ON asg.id = m.assigned_to`;

export async function listMaintenance(f: { status?: string; priority?: string; resourceId?: number; q?: string; reportedBy?: number }, p: Page) {
  const where: string[] = []; const params: unknown[] = [];
  if (f.status) { where.push('m.status = ?'); params.push(f.status); }
  if (f.priority) { where.push('m.priority = ?'); params.push(f.priority); }
  if (f.resourceId) { where.push('m.resource_id = ?'); params.push(f.resourceId); }
  if (f.reportedBy) { where.push('m.reported_by = ?'); params.push(f.reportedBy); }
  if (f.q) { where.push('(m.title LIKE ? OR r.name LIKE ?)'); params.push(`%${f.q}%`, `%${f.q}%`); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await query(`${SELECT} ${w} ORDER BY FIELD(m.status,'reported','open','in_progress','resolved','closed'), m.created_at DESC LIMIT ? OFFSET ?`, [...params, p.limit, p.offset]);
  const c = await queryOne<RowDataPacket>(`SELECT COUNT(*) AS c FROM maintenance_requests m JOIN resources r ON r.id = m.resource_id ${w}`, params);
  return { items: mapRows(rows), total: Number(c?.c ?? 0) };
}

export async function maintenanceSummary() {
  const rows = await query<RowDataPacket>('SELECT status, COUNT(*) AS c FROM maintenance_requests GROUP BY status');
  const out: Record<string, number> = { reported: 0, open: 0, in_progress: 0, resolved: 0, closed: 0 };
  rows.forEach((r) => { out[r.status] = Number(r.c); });
  return out;
}

interface MInput {
  resourceId: number; title: string; description?: string | null; priority: string; status?: string;
  startsAt?: string; expectedEnd?: string | null; assignedTo?: number | null;
}

/** Bookings that overlap a blocking maintenance window are cancelled (and their owners notified by the trigger). */
async function cancelAffectedBookings(conn: import('mysql2/promise').PoolConnection, resourceId: number, title: string,
                                       startsAt: string, expectedEnd: string | null, actor: AuthUser) {
  await conn.query('SET @sc_actor = ?', [actor.id]);
  const [aff] = await conn.query<RowDataPacket[]>(
    `SELECT id FROM bookings WHERE resource_id = ? AND status IN ('pending','approved') AND end_time > NOW()
        AND start_time < COALESCE(?, '9999-12-31 00:00:00') AND end_time > ?`, [resourceId, expectedEnd, startsAt]);
  if (aff.length) {
    await conn.query(
      `UPDATE bookings SET status = 'cancelled', cancelled_at = NOW(), cancel_reason = ?
        WHERE id IN (?)`, [`Resource under maintenance: ${title}`.slice(0, 255), aff.map((a) => a.id)]);
  }
  return aff.map((a) => Number(a.id));
}

export async function createMaintenance(user: AuthUser, i: MInput, asReport: boolean) {
  const status = asReport ? 'reported' : (i.status ?? 'open');
  const startsAt = i.startsAt ? toSqlDateTime(i.startsAt) : null;
  const end = i.expectedEnd ? toSqlDateTime(i.expectedEnd) : null;
  const ex = await queryOne('SELECT id FROM resources WHERE id = ?', [i.resourceId]);
  if (!ex) throw ApiError.badRequest('Resource does not exist');

  const { id, cancelled } = await withTransaction(async (conn) => {
    await conn.query('SET @sc_actor = ?', [user.id]);
    const [res] = await conn.query(
      `INSERT INTO maintenance_requests (resource_id, reported_by, assigned_to, title, description, priority, status, starts_at, expected_end)
       VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()), ?)`,
      [i.resourceId, user.id, asReport ? null : i.assignedTo ?? null, i.title, i.description ?? null, i.priority, status, startsAt, end]);
    const newId = (res as { insertId: number }).insertId;
    let cancelledIds: number[] = [];
    if (BLOCKING.includes(status)) {
      const [m] = await conn.query<RowDataPacket[]>('SELECT starts_at FROM maintenance_requests WHERE id = ?', [newId]);
      cancelledIds = await cancelAffectedBookings(conn, i.resourceId, i.title, String(m[0].starts_at), end, user);
    }
    return { id: newId, cancelled: cancelledIds };
  });
  cancelled.forEach((bid) => logBookingEvent({ event: 'auto_cancelled', booking: { id: bid }, actor: { id: user.id, name: user.name, role: user.role }, note: `Maintenance: ${i.title}` }));
  syncSoon();
  return { ...mapRow<Record<string, unknown>>(await queryOne(`${SELECT} WHERE m.id = ?`, [id])), cancelledBookings: cancelled.length };
}

export async function updateMaintenance(user: AuthUser, id: number, i: Partial<MInput>) {
  const cur = await queryOne<RowDataPacket>('SELECT * FROM maintenance_requests WHERE id = ?', [id]);
  if (!cur) throw ApiError.notFound('Maintenance request not found');
  const sets: string[] = []; const params: unknown[] = [];
  const add = (col: string, v: unknown) => { sets.push(`${col} = ?`); params.push(v); };
  if (i.title !== undefined) add('title', i.title);
  if (i.description !== undefined) add('description', i.description);
  if (i.priority !== undefined) add('priority', i.priority);
  if (i.assignedTo !== undefined) add('assigned_to', i.assignedTo);
  if (i.startsAt !== undefined) add('starts_at', toSqlDateTime(i.startsAt));
  if (i.expectedEnd !== undefined) add('expected_end', i.expectedEnd ? toSqlDateTime(i.expectedEnd) : null);
  if (i.status !== undefined) {
    add('status', i.status);
    if (['resolved', 'closed'].includes(i.status) && !cur.resolved_at) sets.push('resolved_at = NOW()');
    if (BLOCKING.includes(i.status)) sets.push('resolved_at = NULL');
  }
  const cancelled = await withTransaction(async (conn) => {
    await conn.query('SET @sc_actor = ?', [user.id]);
    if (sets.length) await conn.query(`UPDATE maintenance_requests SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
    const [m] = await conn.query<RowDataPacket[]>('SELECT * FROM maintenance_requests WHERE id = ?', [id]);
    const row = m[0];
    if (BLOCKING.includes(row.status)) {
      return cancelAffectedBookings(conn, row.resource_id, row.title, String(row.starts_at), row.expected_end ? String(row.expected_end) : null, user);
    }
    return [] as number[];
  });
  cancelled.forEach((bid) => logBookingEvent({ event: 'auto_cancelled', booking: { id: bid }, actor: { id: user.id, name: user.name, role: user.role }, note: 'Maintenance window' }));
  syncSoon();
  return { ...mapRow<Record<string, unknown>>(await queryOne(`${SELECT} WHERE m.id = ?`, [id])), cancelledBookings: cancelled.length };
}

export async function deleteMaintenance(id: number) {
  const res = await execute('DELETE FROM maintenance_requests WHERE id = ?', [id]);
  if (res.affectedRows === 0) throw ApiError.notFound('Maintenance request not found');
  // refresh resource status after the window disappears
  await execute(`UPDATE resources r SET r.status = IF(EXISTS(SELECT 1 FROM maintenance_requests m WHERE m.resource_id = r.id
      AND m.status IN ('open','in_progress') AND m.starts_at <= NOW() AND (m.expected_end IS NULL OR m.expected_end > NOW())),'maintenance','available')
      WHERE r.status <> 'retired'`);
}

export const listStaff = async () => mapRows(await query("SELECT u.id, u.full_name FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'admin' AND u.status = 'active' ORDER BY u.full_name"));
