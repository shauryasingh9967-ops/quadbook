import { useLoad } from './hooks';
import { RibbonLegend, SlotRibbon, type RibbonSlot } from './SlotRibbon';
import { get } from '../lib/api';
import { fmtRange } from '../lib/format';
import { useHours } from '../lib/slots';
import type { ScheduleEvent } from '../lib/types';
import { Skeleton } from './ui';

export function useDayEvents(resourceId: number | null, date: string) {
  return useLoad(async () => resourceId ? (await get<ScheduleEvent[]>(`/resources/${resourceId}/schedule`, { from: date, to: date })).data : [], [resourceId, date]);
}

export const toSlots = (ev: ScheduleEvent[]): RibbonSlot[] => ev.map((e) => ({
  type: e.type, start: e.start, end: e.end, mine: e.mine, pending: e.status === 'pending', title: e.title,
}));

export function DayAvailability({ events, loading, pick }: { events: ScheduleEvent[] | null; loading: boolean; pick?: { start: string; end: string } | null }) {
  const h = useHours();
  if (loading && !events) return <Skeleton className="h-16" />;
  const list = events ?? [];
  const slots = [...toSlots(list), ...(pick ? [{ type: 'pick' as const, start: pick.start, end: pick.end }] : [])];
  return (
    <div>
      <SlotRibbon slots={slots} startHour={h.start} endHour={h.end} height={22} ticks nowMarker />
      <div className="mt-3"><RibbonLegend /></div>
      {list.length === 0 ? <p className="mt-4 text-sm text-muted">Nothing is scheduled on this day. The whole day is open.</p> : (
        <ul className="mt-4 divide-y divide-line rounded-lg border border-line text-sm">
          {list.sort((a, b) => a.start.localeCompare(b.start)).map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2"><span className="truncate">{e.title}</span><span className="shrink-0 tabular-nums text-muted">{fmtRange(e.start, e.end)}</span></li>))}
        </ul>)}
    </div>
  );
}
