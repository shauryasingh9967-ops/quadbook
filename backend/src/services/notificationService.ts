import { RowDataPacket } from 'mysql2';
import { execute, query, queryOne } from '../db/mysql';
import { mongoState } from '../db/mongo';
import { NotificationHistory } from '../models/NotificationHistory';
import { mapRow, mapRows } from '../utils/mapper';
import { ApiError } from '../utils/apiError';
import { Page } from '../utils/http';
import { logger } from '../utils/logger';

export async function listNotifications(userId: number, p: Page, unreadOnly: boolean, type?: string) {
  const where = ['user_id = ?'];
  const params: unknown[] = [userId];
  if (unreadOnly) where.push('is_read = 0');
  if (type) { where.push('type = ?'); params.push(type); }
  const w = where.join(' AND ');
  const rows = await query(`SELECT id, type, title, message, booking_id, maintenance_id, is_read, created_at
                              FROM notifications WHERE ${w} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
                           [...params, p.limit, p.offset]);
  const cnt = await queryOne<RowDataPacket>(`SELECT COUNT(*) AS c FROM notifications WHERE ${w}`, params);
  return { items: mapRows(rows), total: Number(cnt?.c ?? 0) };
}

export async function unreadCount(userId: number): Promise<number> {
  const r = await queryOne<RowDataPacket>('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0', [userId]);
  return Number(r?.c ?? 0);
}

export async function markRead(userId: number, id: number) {
  const res = await execute('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [id, userId]);
  if (!res.affectedRows) throw ApiError.notFound('Notification not found');
  return mapRow(await queryOne('SELECT id, is_read FROM notifications WHERE id = ?', [id]));
}

export async function markAllRead(userId: number) {
  const res = await execute('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [userId]);
  return { updated: res.affectedRows };
}

export async function deleteNotification(userId: number, id: number) {
  const res = await execute('DELETE FROM notifications WHERE id = ? AND user_id = ?', [id, userId]);
  if (!res.affectedRows) throw ApiError.notFound('Notification not found');
}

/**
 * Outbox pattern: notifications are created inside MySQL transactions (by triggers). This sweep copies
 * every row with mongo_synced = 0 into MongoDB's notification_history, then flags it as synced.
 * If MongoDB is down nothing is lost - rows stay flagged 0 and are copied on the next sweep.
 */
let syncing = false;
export async function syncNotificationHistory(batch = 500): Promise<number> {
  if (syncing || !mongoState.connected) return 0;
  syncing = true;
  try {
    const rows = await query<RowDataPacket>(
      `SELECT id, user_id, type, title, message, booking_id, maintenance_id, created_at
         FROM notifications WHERE mongo_synced = 0 ORDER BY id LIMIT ?`, [batch]);
    if (!rows.length) return 0;
    await NotificationHistory.bulkWrite(rows.map((r) => ({
      updateOne: {
        filter: { mysqlId: r.id },
        update: { $setOnInsert: {
          mysqlId: r.id, userId: r.user_id, type: r.type, title: r.title, message: r.message,
          bookingId: r.booking_id ?? undefined, maintenanceId: r.maintenance_id ?? undefined,
          createdAtSource: new Date(String(r.created_at).replace(' ', 'T')), channel: 'in-app', syncedAt: new Date(),
        } },
        upsert: true,
      },
    })));
    await execute('UPDATE notifications SET mongo_synced = 1 WHERE id IN (?)', [rows.map((r) => r.id)]);
    return rows.length;
  } catch (e) {
    logger.warn(`Notification sync skipped: ${(e as Error).message}`);
    return 0;
  } finally {
    syncing = false;
  }
}

export const syncSoon = () => { void syncNotificationHistory(); };
