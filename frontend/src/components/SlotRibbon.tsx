import { cx } from './ui';
import { parse } from '../lib/format';
import { hourLabel } from '../lib/format';

export interface RibbonSlot { type: 'booking' | 'class' | 'maintenance' | 'pick'; start: string; end: string; mine?: boolean; pending?: boolean; title?: string }

/** One day of a resource as a horizontal strip: the product's signature visual. */
export function SlotRibbon({ slots, startHour, endHour, height = 12, ticks = false, nowMarker = false, className }:
  { slots: RibbonSlot[]; startHour: number; endHour: number; height?: number; ticks?: boolean; nowMarker?: boolean; className?: string }) {
  const total = (endHour - startHour) * 60;
  const pos = (s: string) => { const d = parse(s); return Math.min(total, Math.max(0, d.getHours() * 60 + d.getMinutes() - startHour * 60)); };
  const now = new Date(); const nowMin = now.getHours() * 60 + now.getMinutes() - startHour * 60;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-md bg-surface-2 ring-1 ring-inset ring-line" style={{ height }} role="img"
        aria-label={`Occupancy ${hourLabel(startHour)} to ${hourLabel(endHour)}: ${slots.length} busy period${slots.length === 1 ? '' : 's'}`}>
        {hours.slice(1, -1).map((h) => <span key={h} className="absolute inset-y-0 w-px bg-line/80" style={{ left: `${((h - startHour) * 60 / total) * 100}%` }} />)}
        {slots.map((s, i) => {
          const a = pos(s.start), b = pos(s.end);
          if (b <= a) return null;
          const cls = s.type === 'class' ? 'rb-class' : s.type === 'maintenance' ? 'rb-maint' : s.type === 'pick' ? 'rb-pick' : s.mine ? 'rb-mine' : s.pending ? 'rb-pending' : 'rb-booked';
          return <span key={i} title={s.title} className={cx('absolute inset-y-0.5 rounded-[3px]', cls)} style={{ left: `${(a / total) * 100}%`, width: `${((b - a) / total) * 100}%` }} />;
        })}
        {nowMarker && nowMin > 0 && nowMin < total && <span className="absolute inset-y-0 w-0.5 bg-bad" style={{ left: `${(nowMin / total) * 100}%` }} />}
      </div>
      {ticks && (
        <div className="relative mt-1.5 h-4 text-[11px] text-muted">
          {hours.filter((_, i) => i % 2 === 0).map((h) => <span key={h} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${((h - startHour) / (endHour - startHour)) * 100}%` }}>{hourLabel(h)}</span>)}
        </div>
      )}
    </div>
  );
}

export function RibbonLegend({ showMine = true }: { showMine?: boolean }) {
  const item = (cls: string, label: string) => <span className="inline-flex items-center gap-1.5"><span className={cx('inline-block h-3 w-5 rounded-[3px]', cls)} />{label}</span>;
  return <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">{item('rb-booked', 'Booked')}{item('rb-pending', 'Awaiting approval')}{showMine && item('rb-mine', 'Your booking')}{item('rb-class', 'Scheduled class')}{item('rb-maint', 'Maintenance')}</div>;
}
