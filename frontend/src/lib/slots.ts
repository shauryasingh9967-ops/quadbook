import { useEffect, useState } from 'react';
import { get } from './api';

export interface Hours { start: number; end: number; maxStudent: number; maxFaculty: number; windowDays: number }
let cache: Hours | null = null;
export function useHours(): Hours {
  const [h, setH] = useState<Hours>(cache ?? { start: 8, end: 20, maxStudent: 3, maxFaculty: 6, windowDays: 30 });
  useEffect(() => {
    if (cache) return;
    get<Record<string, string>>('/public/settings').then((r) => {
      cache = { start: Number(r.data.day_start_hour ?? 8), end: Number(r.data.day_end_hour ?? 20), maxStudent: Number(r.data.max_hours_student ?? 3), maxFaculty: Number(r.data.max_hours_faculty ?? 6), windowDays: Number(r.data.booking_window_days ?? 30) };
      setH(cache);
    }).catch(() => undefined);
  }, []);
  return h;
}
export const invalidateHours = () => { cache = null; };

export function timeOptions(start: number, end: number) {
  const out: string[] = [];
  for (let m = start * 60; m <= end * 60; m += 30) out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  return out;
}
export const label12 = (t: string) => { const [h, m] = t.split(':').map(Number); return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
export const minutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
