import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { get } from '../lib/api';
import { fmtDay } from '../lib/format';
import { RibbonLegend, SlotRibbon } from './SlotRibbon';

interface Board { date: string; startHour: number; endHour: number; resources: Array<{ id: number; name: string; building: string; room: string; capacity: number; slots: Array<{ type: 'booking' | 'class' | 'maintenance'; start: string; end: string }> }> }

/** Live, anonymous occupancy for today, straight from MySQL (public endpoint). */
export function LiveBoard() {
  const [b, setB] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { get<Board>('/public/availability').then((r) => setB(r.data)).catch(() => setFailed(true)); }, []);
  return (
    <div className="rounded-[18px] border border-line-strong bg-surface p-5 shadow-[0_24px_60px_-30px_rgba(14,107,95,0.45)] sm:p-6">
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <h2 className="text-xl">Today on campus</h2>
        <span className="text-sm text-muted">{b ? fmtDay(b.date) : ''}</span>
      </div>
      {failed && <p className="py-10 text-center text-sm text-muted">Live availability will appear here once the server is running.</p>}
      {!b && !failed && <div className="space-y-5">{[0, 1, 2, 3].map((i) => <div key={i} className="space-y-2"><div className="h-4 w-40 animate-pulse rounded bg-line/70" /><div className="h-3 animate-pulse rounded bg-line/70" /></div>)}</div>}
      {b && (
        <div className="space-y-5">
          {b.resources.map((r, i) => (
            <div key={r.id}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <p className="truncate text-sm font-semibold">{r.name}</p>
                <p className="shrink-0 text-xs text-muted">{r.building} · {r.room}</p>
              </div>
              <motion.div initial={{ clipPath: 'inset(0 100% 0 0)' }} animate={{ clipPath: 'inset(0 0% 0 0)' }} transition={{ duration: 0.8, delay: 0.25 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}>
                <SlotRibbon slots={r.slots} startHour={b.startHour} endHour={b.endHour} height={14} nowMarker ticks={i === b.resources.length - 1} />
              </motion.div>
            </div>
          ))}
          <div className="border-t border-line pt-4"><RibbonLegend showMine={false} /></div>
        </div>
      )}
    </div>
  );
}
