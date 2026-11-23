import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { RowDataPacket } from 'mysql2';
import { env } from '../config/env';
import { execute, query, queryOne } from '../db/mysql';
import { ApiError } from '../utils/apiError';
import { mapRow } from '../utils/mapper';
import { getSettingBool } from './settingsService';

const publicUserSql = `SELECT u.id, u.full_name, u.email, u.member_id, u.phone, u.status, u.last_login_at, u.created_at,
       r.name AS role, d.id AS department_id, d.name AS department_name, d.code AS department_code
  FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN departments d ON d.id = u.department_id`;

export async function getUserById(id: number) {
  return mapRow(await queryOne(`${publicUserSql} WHERE u.id = ?`, [id]));
}

function signToken(user: { id: number; role: string }) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ role: user.role }, env.JWT_SECRET, {
    algorithm: 'HS256', subject: String(user.id), jwtid: jti, expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
  return token;
}

// a valid hash used to equalise timing when the e-mail does not exist
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 8);

export async function register(input: {
  fullName: string; email: string; password: string; role: 'student' | 'faculty'; memberId: string;
  departmentId: number; phone?: string;
}) {
  if (!(await getSettingBool('allow_registration'))) throw ApiError.forbidden('Self-registration is currently disabled by the administrator');
  const dept = await queryOne('SELECT id FROM departments WHERE id = ?', [input.departmentId]);
  if (!dept) throw ApiError.badRequest('Selected department does not exist');

  const hash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);
  const res = await execute(
    `INSERT INTO users (role_id, department_id, email, password_hash, full_name, member_id, phone)
     VALUES ((SELECT id FROM roles WHERE name = ?), ?, ?, ?, ?, ?, ?)`,
    [input.role, input.departmentId, input.email, hash, input.fullName, input.memberId, input.phone || null],
  );
  const user = await getUserById(res.insertId) as { id: number; role: string };
  return { user, token: signToken(user) };
}

export async function login(email: string, pwd: string) {
  const row = await queryOne<RowDataPacket>(
    `SELECT u.id, u.password_hash, u.status, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = ?`,
    [email],
  );
  const okPwd = await bcrypt.compare(pwd, row?.password_hash ?? DUMMY_HASH);
  if (!row || !okPwd) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');
  if (row.status !== 'active') throw ApiError.forbidden('This account has been suspended. Contact an administrator.');
  await execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [row.id]);
  const user = await getUserById(row.id);
  return { user, token: signToken({ id: row.id, role: row.role }) };
}

export async function logout(jti: string, exp: number) {
  await execute('INSERT IGNORE INTO revoked_tokens (jti, expires_at) VALUES (?, FROM_UNIXTIME(?))', [jti, exp]);
}

export async function forgotPassword(email: string) {
  const u = await queryOne<RowDataPacket>('SELECT id FROM users WHERE email = ? AND status = \'active\'', [email]);
  if (!u) return { token: null as string | null };
  const token = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  await execute('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))', [u.id, hash]);
  return { token };
}

export async function resetPassword(token: string, newPassword: string) {
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const row = await queryOne<RowDataPacket>(
    'SELECT id, user_id FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()', [hash]);
  if (!row) throw ApiError.badRequest('This reset link is invalid or has expired');
  const pwdHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
  await execute('UPDATE users SET password_hash = ? WHERE id = ?', [pwdHash, row.user_id]);
  await execute('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?', [row.id]);
  return { userId: row.user_id as number };
}

export async function updateProfile(userId: number, p: { fullName?: string; phone?: string | null; departmentId?: number | null }) {
  const sets: string[] = []; const params: unknown[] = [];
  if (p.fullName !== undefined) { sets.push('full_name = ?'); params.push(p.fullName); }
  if (p.phone !== undefined) { sets.push('phone = ?'); params.push(p.phone || null); }
  if (p.departmentId !== undefined) { sets.push('department_id = ?'); params.push(p.departmentId); }
  if (sets.length) await execute(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...params, userId]);
  return getUserById(userId);
}

export async function changePassword(userId: number, current: string, next: string) {
  const row = await queryOne<RowDataPacket>('SELECT password_hash FROM users WHERE id = ?', [userId]);
  if (!row || !(await bcrypt.compare(current, row.password_hash))) throw new ApiError(400, 'WRONG_PASSWORD', 'Current password is incorrect');
  await execute('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(next, env.BCRYPT_ROUNDS), userId]);
}

export const listDepartments = async () => query('SELECT id, code, name FROM departments ORDER BY name').then((r) => r.map((x) => mapRow(x)));
