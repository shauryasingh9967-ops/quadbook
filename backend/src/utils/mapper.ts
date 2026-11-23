// Converts MySQL rows (snake_case, 'YYYY-MM-DD HH:MM:SS') to API objects (camelCase, ISO-like local time).
const BOOL_KEYS = new Set(['requiresApproval', 'isRead', 'bookableAddon']);
const DT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const camel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

export function mapRow<T = Record<string, unknown>>(row: unknown): T {
  if (Array.isArray(row)) return row.map((r) => mapRow(r)) as unknown as T;
  if (row === null || typeof row !== 'object') return row as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
    const key = camel(k);
    if (BOOL_KEYS.has(key) && (v === 0 || v === 1)) out[key] = v === 1;
    else if (typeof v === 'string' && DT.test(v)) out[key] = v.replace(' ', 'T');
    else out[key] = v;
  }
  return out as T;
}
export const mapRows = <T = Record<string, unknown>>(rows: unknown[]): T[] => rows.map((r) => mapRow<T>(r));

/** Accepts 'YYYY-MM-DDTHH:mm[:ss]' (what the UI sends) and returns MySQL DATETIME text. */
export function toSqlDateTime(s: string): string {
  const t = s.replace('T', ' ').slice(0, 19);
  return t.length === 16 ? `${t}:00` : t;
}
