import bcrypt from 'bcryptjs';
import { RowDataPacket } from 'mysql2/promise';
import { env } from '../config/env';
import { execute, query, queryOne } from '../db/mysql';
import { ApiError } from '../utils/apiError';
import { mapRow, mapRows } from '../utils/mapper';
import { Page } from '../utils/http';

const SELECT = `SELECT u.id, u.full_name, u.email, u.member_id, u.phone, u.status, u.last_login_at, u.created_at,
  r.name AS role, d.id AS department_id, d.name AS department_name,
  (SELECT COUNT(*) FROM bookings b WHERE b.user_id = u.id) AS booking_count
  FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN departments d ON d.id = u.department_id`;

export async function listUsers(f: { q?: string; role?: string; status?: string; departmentId?: number }, p: Page) {
  const where: string[] = []; const params: unknown[] = [];
  if (f.q) { where.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.member_id LIKE ?)'); const l = `%${f.q}%`; params.push(l, l, l); }
  if (f.role) { where.push('r.name = ?'); params.push(f.role); }
  if (f.status) { where.push('u.status = ?'); params.push(f.status); }
  if (f.departmentId) { where.push('u.department_id = ?'); params.push(f.departmentId); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await query(`${SELECT} ${w} ORDER BY u.created_at DESC, u.id DESC LIMIT ? OFFSET ?`, [...params, p.limit, p.offset]);
  const c = await queryOne<RowDataPacket>(`SELECT COUNT(*) AS c FROM users u JOIN roles r ON r.id = u.role_id ${w}`, params);
  const roleCounts = await query<RowDataPacket>('SELECT r.name AS role, COUNT(*) AS c FROM users u JOIN roles r ON r.id = u.role_id GROUP BY r.name');
  return { items: mapRows(rows), total: Number(c?.c ?? 0), roleCounts: Object.fromEntries(roleCounts.map((r) => [r.role, Number(r.c)])) };
}

export async function createUser(i: { fullName: string; email: string; password: string; role: string; memberId: string; departmentId?: number | null; phone?: string | null }) {
  const hash = await bcrypt.hash(i.password, env.BCRYPT_ROUNDS);
  const r = await execute(
    `INSERT INTO users (role_id, department_id, email, password_hash, full_name, member_id, phone)
     VALUES ((SELECT id FROM roles WHERE name = ?), ?, ?, ?, ?, ?, ?)`,
    [i.role, i.departmentId ?? null, i.email, hash, i.fullName, i.memberId, i.phone || null]);
  return mapRow(await queryOne(`${SELECT} WHERE u.id = ?`, [r.insertId]));
}

export async function updateUser(actorId: number, id: number, i: Partial<{ fullName: string; email: string; role: string; memberId: string; departmentId: number | null; phone: string | null; status: string }>) {
  const cur = await queryOne('SELECT id FROM users WHERE id = ?', [id]);
  if (!cur) throw ApiError.notFound('User not found');
  if (id === actorId && (i.status === 'suspended' || (i.role && i.role !== 'admin'))) {
    throw ApiError.badRequest('You cannot suspend or demote your own account');
  }
  const sets: string[] = []; const params: unknown[] = [];
  const add = (c: string, v: unknown) => { sets.push(`${c} = ?`); params.push(v); };
  if (i.fullName !== undefined) add('full_name', i.fullName);
  if (i.email !== undefined) add('email', i.email);
  if (i.memberId !== undefined) add('member_id', i.memberId);
  if (i.phone !== undefined) add('phone', i.phone || null);
  if (i.departmentId !== undefined) add('department_id', i.departmentId);
  if (i.status !== undefined) add('status', i.status);
  if (i.role !== undefined) { sets.push('role_id = (SELECT id FROM roles WHERE name = ?)'); params.push(i.role); }
  if (sets.length) await execute(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  return mapRow(await queryOne(`${SELECT} WHERE u.id = ?`, [id]));
}

export async function resetUserPassword(id: number, pwd: string) {
  const r = await execute('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(pwd, env.BCRYPT_ROUNDS), id]);
  if (!r.affectedRows) throw ApiError.notFound('User not found');
}

/** Users with booking history are suspended instead of deleted so the audit trail stays intact. */
export async function deleteUser(actorId: number, id: number) {
  if (id === actorId) throw ApiError.badRequest('You cannot delete your own account');
  const u = await queryOne('SELECT id FROM users WHERE id = ?', [id]);
  if (!u) throw ApiError.notFound('User not found');
  const used = await queryOne<RowDataPacket>('SELECT (SELECT COUNT(*) FROM bookings WHERE user_id = ?) + (SELECT COUNT(*) FROM booking_approvals WHERE admin_id = ?) AS c', [id, id]);
  if (Number(used?.c) > 0) {
    await execute("UPDATE users SET status = 'suspended' WHERE id = ?", [id]);
    return { deleted: false, suspended: true };
  }
  await execute('DELETE FROM users WHERE id = ?', [id]);
  return { deleted: true, suspended: false };
}
