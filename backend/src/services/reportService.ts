import { query } from '../db/mysql';
import { mapRows } from '../utils/mapper';

export async function bookingsReport(f: { from: string; to: string; status?: string }) {
  const where = ['DATE(start_time) BETWEEN ? AND ?']; const params: unknown[] = [f.from, f.to];
  if (f.status) { where.push('status = ?'); params.push(f.status); }
  return mapRows(await query(`SELECT * FROM v_booking_details WHERE ${where.join(' AND ')} ORDER BY start_time`, params)) as Array<Record<string, unknown>>;
}

const csvCell = (v: unknown) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function bookingsToCsv(rows: Array<Record<string, unknown>>) {
  const cols: Array<[string, string]> = [
    ['bookingCode', 'Booking Code'], ['status', 'Status'], ['resourceName', 'Resource'], ['categoryName', 'Category'],
    ['buildingName', 'Building'], ['roomNumber', 'Room'], ['userName', 'Booked By'], ['userRole', 'Role'],
    ['departmentName', 'Department'], ['startTime', 'Start'], ['endTime', 'End'], ['hours', 'Hours'],
    ['attendees', 'Attendees'], ['purpose', 'Purpose'], ['decidedByName', 'Decided By'],
  ];
  const lines = [cols.map((c) => c[1]).join(',')];
  for (const r of rows) lines.push(cols.map(([k]) => csvCell(r[k])).join(','));
  return lines.join('\r\n');
}
