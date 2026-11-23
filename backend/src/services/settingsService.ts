import { RowDataPacket } from 'mysql2';
import { execute, query, queryOne } from '../db/mysql';
import { ApiError } from '../utils/apiError';

export async function getAllSettings() {
  const rows = await query<RowDataPacket>('SELECT setting_key, setting_value, description, updated_at FROM system_settings ORDER BY setting_key');
  return rows.map((r) => ({ key: r.setting_key as string, value: r.setting_value as string, description: r.description as string, updatedAt: String(r.updated_at).replace(' ', 'T') }));
}
export async function getPublicSettings() {
  const rows = await query<RowDataPacket>(
    `SELECT setting_key, setting_value FROM system_settings
      WHERE setting_key IN ('institution_name','allow_registration','day_start_hour','day_end_hour','support_email','booking_window_days','max_hours_student','max_hours_faculty')`);
  return Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value])) as Record<string, string>;
}
export async function getSettingBool(key: string) {
  const r = await queryOne<RowDataPacket>('SELECT setting_value FROM system_settings WHERE setting_key = ?', [key]);
  return r?.setting_value === '1';
}

const RULES: Record<string, { type: 'int' | 'bool' | 'text'; min?: number; max?: number }> = {
  max_hours_student: { type: 'int', min: 1, max: 12 },
  max_hours_faculty: { type: 'int', min: 1, max: 12 },
  booking_window_days: { type: 'int', min: 1, max: 365 },
  day_start_hour: { type: 'int', min: 0, max: 23 },
  day_end_hour: { type: 'int', min: 1, max: 24 },
  allow_registration: { type: 'bool' },
  institution_name: { type: 'text' },
  support_email: { type: 'text' },
};

export async function updateSettings(values: Record<string, string>) {
  for (const [k, raw] of Object.entries(values)) {
    const rule = RULES[k];
    if (!rule) throw ApiError.badRequest(`Unknown setting "${k}"`);
    const v = String(raw).trim();
    if (rule.type === 'int') {
      const n = Number(v);
      if (!Number.isInteger(n) || n < (rule.min ?? 0) || n > (rule.max ?? 1e6)) throw ApiError.badRequest(`${k} must be a whole number between ${rule.min} and ${rule.max}`);
    }
    if (rule.type === 'bool' && !['0', '1'].includes(v)) throw ApiError.badRequest(`${k} must be 0 or 1`);
    if (rule.type === 'text' && (v.length < 2 || v.length > 120)) throw ApiError.badRequest(`${k} must be 2-120 characters`);
  }
  const start = Number(values.day_start_hour ?? (await getAllSettings()).find((s) => s.key === 'day_start_hour')?.value);
  const end = Number(values.day_end_hour ?? (await getAllSettings()).find((s) => s.key === 'day_end_hour')?.value);
  if (start >= end) throw ApiError.badRequest('Closing hour must be later than opening hour');
  for (const [k, v] of Object.entries(values)) {
    await execute('UPDATE system_settings SET setting_value = ? WHERE setting_key = ?', [String(v).trim(), k]);
  }
  return getAllSettings();
}
