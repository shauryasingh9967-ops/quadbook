import { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { execute, query, queryOne, withTransaction } from '../db/mysql';
import { ApiError } from '../utils/apiError';
import { mapRow, mapRows } from '../utils/mapper';
import { Page } from '../utils/http';
import { AuthUser } from '../types/express';

const SORTS: Record<string, string> = {
  name: 'name ASC', capacity: 'capacity DESC', capacity_asc: 'capacity ASC',
  popular: 'upcoming_bookings DESC, name ASC', newest: 'created_at DESC',
};

export interface ResourceFilters {
  q?: string; categoryId?: number; kind?: string; buildingId?: number; status?: string;
  minCapacity?: number; departmentId?: number; sort?: string;
}

export async function listResources(f: ResourceFilters, p: Page, isAdmin: boolean) {
  const where: string[] = []; const params: unknown[] = [];
  if (!isAdmin) where.push("status <> 'retired'");
  if (f.q) { where.push('(name LIKE ? OR code LIKE ? OR description LIKE ? OR building_name LIKE ? OR category_name LIKE ?)'); const l = `%${f.q}%`; params.push(l, l, l, l, l); }
  if (f.categoryId) { where.push('category_id = ?'); params.push(f.categoryId); }
  if (f.kind) { where.push('category_kind = ?'); params.push(f.kind); }
  if (f.buildingId) { where.push('building_id = ?'); params.push(f.buildingId); }
  if (f.departmentId) { where.push('department_id = ?'); params.push(f.departmentId); }
  if (f.status) { where.push('status = ?'); params.push(f.status); }
  if (f.minCapacity) { where.push('capacity >= ?'); params.push(f.minCapacity); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const order = SORTS[f.sort ?? 'name'] ?? SORTS.name;
  const rows = await query(`SELECT * FROM v_resource_catalog ${w} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, p.limit, p.offset]);
  const c = await queryOne<RowDataPacket>(`SELECT COUNT(*) AS c FROM v_resource_catalog ${w}`, params);
  return { items: mapRows(rows), total: Number(c?.c ?? 0) };
}

export async function getResourceDetail(id: number, user: AuthUser) {
  const row = await queryOne('SELECT * FROM v_resource_catalog WHERE id = ?', [id]);
  if (!row) throw ApiError.notFound('Resource not found');
  const resource = mapRow<Record<string, unknown>>(row);
  if (resource.status === 'retired' && user.role !== 'admin') throw ApiError.notFound('Resource not found');

  const [equipment, schedules, upcoming, maintenance] = await Promise.all([
    query(`SELECT id, name, asset_tag, quantity_total, status, bookable_addon FROM equipment
            WHERE resource_id = ? AND status <> 'retired' ORDER BY name`, [id]),
    query(`SELECT id, course_code, course_name, semester, day_of_week, TIME_FORMAT(start_time,'%H:%i') AS start_time,
                  TIME_FORMAT(end_time,'%H:%i') AS end_time
             FROM academic_schedules WHERE resource_id = ? AND valid_to >= CURDATE() ORDER BY day_of_week, start_time`, [id]),
    query(`SELECT id, start_time, end_time, status, (user_id = ?) AS mine
             FROM bookings WHERE resource_id = ? AND status IN ('pending','approved')
              AND end_time >= NOW() AND start_time < DATE_ADD(NOW(), INTERVAL 14 DAY) ORDER BY start_time LIMIT 20`, [user.id, id]),
    query(`SELECT id, title, status, priority, starts_at, expected_end FROM maintenance_requests
            WHERE resource_id = ? AND status IN ('open','in_progress') ORDER BY starts_at`, [id]),
  ]);
  return {
    ...resource,
    equipment: mapRows(equipment), schedules: mapRows(schedules),
    upcomingBookings: mapRows(upcoming).map((b) => ({ ...(b as object), mine: Boolean((b as { mine: unknown }).mine) })),
    maintenance: mapRows(maintenance),
  };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Calendar feed: bookings + recurring classes + maintenance windows for [from, to]. */
export async function getScheduleEvents(resourceId: number, from: string, to: string, user: AuthUser) {
  const exists = await queryOne('SELECT id FROM resources WHERE id = ?', [resourceId]);
  if (!exists) throw ApiError.notFound('Resource not found');
  const d1 = new Date(`${from}T12:00:00Z`); const d2 = new Date(`${to}T12:00:00Z`);
  if (d2 < d1 || (d2.getTime() - d1.getTime()) / 86400_000 > 62) throw ApiError.badRequest('Date range must be 0-62 days');

  const events: Array<Record<string, unknown>> = [];
  const bookings = await query<RowDataPacket>(
    `SELECT id, user_id, status, start_time, end_time, purpose FROM bookings
      WHERE resource_id = ? AND status IN ('pending','approved','completed') AND DATE(start_time) BETWEEN ? AND ?
      ORDER BY start_time`, [resourceId, from, to]);
  for (const b of bookings) {
    const mine = b.user_id === user.id;
    events.push({
      id: `b${b.id}`, type: 'booking', bookingId: b.id, status: b.status, mine,
      title: mine || user.role === 'admin' ? b.purpose : 'Reserved',
      start: String(b.start_time).replace(' ', 'T'), end: String(b.end_time).replace(' ', 'T'),
    });
  }
  const sched = await query<RowDataPacket>(
    `SELECT id, course_code, course_name, day_of_week, TIME_FORMAT(start_time,'%H:%i:%s') AS st,
            TIME_FORMAT(end_time,'%H:%i:%s') AS et, valid_from, valid_to
       FROM academic_schedules WHERE resource_id = ? AND valid_to >= ? AND valid_from <= ?`, [resourceId, from, to]);
  for (let d = new Date(d1); d <= d2; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = (d.getUTCDay() + 6) % 7; const day = ymd(d);
    for (const s of sched) {
      if (s.day_of_week === dow && day >= String(s.valid_from).slice(0, 10) && day <= String(s.valid_to).slice(0, 10)) {
        events.push({ id: `c${s.id}-${day}`, type: 'class', title: `${s.course_code} · ${s.course_name}`, start: `${day}T${s.st}`, end: `${day}T${s.et}` });
      }
    }
  }
  const maint = await query<RowDataPacket>(
    `SELECT id, title, starts_at, expected_end FROM maintenance_requests
      WHERE resource_id = ? AND status IN ('open','in_progress') AND DATE(starts_at) <= ?
        AND (expected_end IS NULL OR DATE(expected_end) >= ?)`, [resourceId, to, from]);
  for (const m of maint) {
    const start = String(m.starts_at).slice(0, 10) < from ? `${from} 00:00:00` : String(m.starts_at);
    const endRaw = m.expected_end ? String(m.expected_end) : `${to} 23:59:59`;
    const end = endRaw.slice(0, 10) > to ? `${to} 23:59:59` : endRaw;
    events.push({ id: `m${m.id}`, type: 'maintenance', title: `Maintenance: ${m.title}`, start: start.replace(' ', 'T'), end: end.replace(' ', 'T') });
  }
  return events;
}

export interface ResourceInput {
  code: string; name: string; categoryId: number; buildingId: number; roomNumber: string; floorNo: number;
  departmentId?: number | null; capacity: number; description?: string | null;
  status?: 'available' | 'maintenance' | 'retired'; requiresApproval: boolean;
}

async function resolveRoom(conn: PoolConnection, i: ResourceInput): Promise<number> {
  const [rows] = await conn.query<RowDataPacket[]>('SELECT id FROM rooms WHERE building_id = ? AND room_number = ?', [i.buildingId, i.roomNumber]);
  if (rows.length) {
    await conn.query('UPDATE rooms SET capacity = GREATEST(capacity, ?), floor_no = ? WHERE id = ?', [i.capacity, i.floorNo, rows[0].id]);
    return rows[0].id;
  }
  const [res] = await conn.query('INSERT INTO rooms (building_id, room_number, floor_no, capacity) VALUES (?, ?, ?, ?)', [i.buildingId, i.roomNumber, i.floorNo, i.capacity]);
  return (res as { insertId: number }).insertId;
}

export async function createResource(i: ResourceInput) {
  const id = await withTransaction(async (conn) => {
    const roomId = await resolveRoom(conn, i);
    const [res] = await conn.query(
      `INSERT INTO resources (code, name, category_id, room_id, department_id, capacity, description, status, requires_approval)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [i.code, i.name, i.categoryId, roomId, i.departmentId ?? null, i.capacity, i.description ?? null, i.status ?? 'available', i.requiresApproval ? 1 : 0]);
    return (res as { insertId: number }).insertId;
  });
  return mapRow(await queryOne('SELECT * FROM v_resource_catalog WHERE id = ?', [id]));
}

export async function updateResource(id: number, i: ResourceInput) {
  const found = await queryOne('SELECT id FROM resources WHERE id = ?', [id]);
  if (!found) throw ApiError.notFound('Resource not found');
  await withTransaction(async (conn) => {
    const roomId = await resolveRoom(conn, i);
    await conn.query(
      `UPDATE resources SET code = ?, name = ?, category_id = ?, room_id = ?, department_id = ?, capacity = ?,
              description = ?, status = ?, requires_approval = ? WHERE id = ?`,
      [i.code, i.name, i.categoryId, roomId, i.departmentId ?? null, i.capacity, i.description ?? null, i.status ?? 'available', i.requiresApproval ? 1 : 0, id]);
  });
  return mapRow(await queryOne('SELECT * FROM v_resource_catalog WHERE id = ?', [id]));
}

/** Hard-delete when nothing references the resource; otherwise retire it so booking history stays intact. */
export async function deleteResource(id: number) {
  const r = await queryOne<RowDataPacket>('SELECT id FROM resources WHERE id = ?', [id]);
  if (!r) throw ApiError.notFound('Resource not found');
  const used = await queryOne<RowDataPacket>('SELECT COUNT(*) AS c FROM bookings WHERE resource_id = ?', [id]);
  if (Number(used?.c) > 0) {
    await execute("UPDATE resources SET status = 'retired' WHERE id = ?", [id]);
    return { deleted: false, retired: true };
  }
  await execute('DELETE FROM resources WHERE id = ?', [id]);
  return { deleted: true, retired: false };
}

export async function getLookups() {
  const [categories, buildings, rooms, departments] = await Promise.all([
    query('SELECT id, name, kind, icon FROM resource_categories ORDER BY name'),
    query('SELECT id, code, name, total_floors FROM buildings ORDER BY name'),
    query('SELECT id, building_id, room_number, floor_no, capacity FROM rooms ORDER BY building_id, room_number'),
    query('SELECT id, code, name FROM departments ORDER BY name'),
  ]);
  return { categories: mapRows(categories), buildings: mapRows(buildings), rooms: mapRows(rooms), departments: mapRows(departments) };
}

// ---------------------------------------------------------------- equipment
export async function listEquipment(f: { q?: string; resourceId?: number; status?: string }, p: Page) {
  const where: string[] = []; const params: unknown[] = [];
  if (f.q) { where.push('(e.name LIKE ? OR e.asset_tag LIKE ? OR r.name LIKE ?)'); const l = `%${f.q}%`; params.push(l, l, l); }
  if (f.resourceId) { where.push('e.resource_id = ?'); params.push(f.resourceId); }
  if (f.status) { where.push('e.status = ?'); params.push(f.status); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await query(
    `SELECT e.id, e.resource_id, e.name, e.asset_tag, e.quantity_total, e.status, e.bookable_addon, e.created_at,
            r.name AS resource_name, r.code AS resource_code
       FROM equipment e JOIN resources r ON r.id = e.resource_id ${w}
      ORDER BY r.name, e.name LIMIT ? OFFSET ?`, [...params, p.limit, p.offset]);
  const c = await queryOne<RowDataPacket>(`SELECT COUNT(*) AS c FROM equipment e JOIN resources r ON r.id = e.resource_id ${w}`, params);
  return { items: mapRows(rows), total: Number(c?.c ?? 0) };
}

export interface EquipmentInput { resourceId: number; name: string; assetTag: string; quantityTotal: number; status: string; bookableAddon: boolean }
export async function createEquipment(i: EquipmentInput) {
  const r = await execute('INSERT INTO equipment (resource_id, name, asset_tag, quantity_total, status, bookable_addon) VALUES (?, ?, ?, ?, ?, ?)',
    [i.resourceId, i.name, i.assetTag, i.quantityTotal, i.status, i.bookableAddon ? 1 : 0]);
  return mapRow(await queryOne('SELECT * FROM equipment WHERE id = ?', [r.insertId]));
}
export async function updateEquipment(id: number, i: EquipmentInput) {
  const r = await execute('UPDATE equipment SET resource_id = ?, name = ?, asset_tag = ?, quantity_total = ?, status = ?, bookable_addon = ? WHERE id = ?',
    [i.resourceId, i.name, i.assetTag, i.quantityTotal, i.status, i.bookableAddon ? 1 : 0, id]);
  if (!r.affectedRows) { const e = await queryOne('SELECT id FROM equipment WHERE id = ?', [id]); if (!e) throw ApiError.notFound('Equipment not found'); }
  return mapRow(await queryOne('SELECT * FROM equipment WHERE id = ?', [id]));
}
export async function deleteEquipment(id: number) {
  const e = await queryOne('SELECT id FROM equipment WHERE id = ?', [id]);
  if (!e) throw ApiError.notFound('Equipment not found');
  const used = await queryOne<RowDataPacket>('SELECT COUNT(*) AS c FROM booking_equipment WHERE equipment_id = ?', [id]);
  if (Number(used?.c) > 0) { await execute("UPDATE equipment SET status = 'retired', bookable_addon = 0 WHERE id = ?", [id]); return { deleted: false, retired: true }; }
  await execute('DELETE FROM equipment WHERE id = ?', [id]);
  return { deleted: true, retired: false };
}
