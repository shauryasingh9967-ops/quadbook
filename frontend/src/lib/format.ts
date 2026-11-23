const pad = (n: number) => String(n).padStart(2, '0');
// The API sends campus-local timestamps without a zone ("2026-11-21T10:00:00"); parse them as local time.
export const parse = (s: string) => new Date(s.length === 10 ? `${s}T00:00:00` : s);
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const todayStr = () => ymd(new Date());
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const startOfWeek = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

export const fmtDate = (s: string) => parse(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtDay = (s: string) => parse(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
export const fmtTime = (s: string) => parse(s).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
export const fmtDateTime = (s: string) => `${fmtDate(s)}, ${fmtTime(s)}`;
export const fmtRange = (a: string, b: string) => `${fmtTime(a)} – ${fmtTime(b)}`;
export const fmtHours = (h: number) => (Number.isInteger(h) ? `${h} h` : `${h.toFixed(1)} h`);

export function timeAgo(s: string) {
  const diff = (Date.now() - parse(s).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} d ago`;
  return fmtDate(s);
}
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
export const initials = (name: string) => name.replace(/^Dr\.\s*/, '').split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
export const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`;
