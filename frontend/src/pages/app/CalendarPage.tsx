import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLoad } from '../../components/hooks';
import { RibbonLegend } from '../../components/SlotRibbon';
import { Button, Card, ErrorState, PageHeader, Select, Skeleton, cx } from '../../components/ui';
import { get } from '../../lib/api';
import { addDays, fmtTime, hm, parse, startOfWeek, ymd } from '../../lib/format';
import { useHours } from '../../lib/slots';
import type { Resource, ScheduleEvent } from '../../lib/types';

const ROW = 52; // px per hour

export default function CalendarPage() {
  const [sp, setSp] = useSearchParams(); const nav = useNavigate(); const h = useHours();
  const [week, setWeek] = useState(() => startOfWeek(new Date()));
  const resources = useLoad(async () => (await get<Resource[]>('/resources', { limit: 100, sort: 'name' })).data, []);
  const resourceId = Number(sp.get('resource') ?? resources.data?.[0]?.id ?? 0);
  const from = ymd(week), to = ymd(addDays(week, 6));
  const ev = useLoad(async () => resourceId ? (await get<ScheduleEvent[]>(`/resources/${resourceId}/schedule`, { from, to })).data : [], [resourceId, from]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const hours = Array.from({ length: h.end - h.start }, (_, i) => h.start + i);
  const today = ymd(new Date());
  const byDay = useMemo(() => { const m: Record<string, ScheduleEvent[]> = {}; (ev.data ?? []).forEach((e) => { (m[e.start.slice(0, 10)] ??= []).push(e); }); return m; }, [ev.data]);

  const pickSlot = (d: Date, hour: number, half: boolean) => {
    const when = new Date(d); when.setHours(hour, half ? 30 : 0, 0, 0);
    if (when < new Date()) return;
    nav(`/app/book/${resourceId}?date=${ymd(d)}&start=${hm(when)}`);
  };

  return (
    <div>
      <PageHeader title="Booking calendar" subtitle="Pick a resource, then click any open slot to start a booking." />
      <Card className="mb-5 flex flex-wrap items-center gap-3 p-3 sm:p-4">
        <div className="min-w-[240px] flex-1"><Select aria-label="Resource" value={resourceId || ''} onChange={(e) => setSp({ resource: e.target.value })}>
          {resources.data?.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.buildingCode} {r.roomNumber})</option>)}</Select></div>
        <div className="flex items-center gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => setWeek((w) => addDays(w, -7))} aria-label="Previous week"><ChevronLeft className="size-4" /></Button>
          <Button variant="secondary" size="sm" onClick={() => setWeek(startOfWeek(new Date()))}>This week</Button>
          <Button variant="secondary" size="sm" onClick={() => setWeek((w) => addDays(w, 7))} aria-label="Next week"><ChevronRight className="size-4" /></Button>
        </div>
        <p className="w-full text-sm font-semibold sm:ml-auto sm:w-auto">{days[0].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – {days[6].toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
      </Card>
      <div className="mb-4"><RibbonLegend /></div>
      {ev.error ? <Card><ErrorState message={ev.error} onRetry={ev.reload} /></Card> : !resourceId ? <Skeleton className="h-96" /> : (
        <Card className="overflow-hidden">
          <div className="scroll-thin overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-line bg-surface-2/70">
                <div />{days.map((d) => <div key={d.toISOString()} className={cx('border-l border-line px-2 py-2.5 text-center text-sm', ymd(d) === today && 'bg-primary-soft')}><p className="font-semibold">{d.toLocaleDateString('en-GB', { weekday: 'short' })}</p><p className="text-xs text-muted">{d.getDate()}</p></div>)}
              </div>
              <div className="relative grid grid-cols-[56px_repeat(7,1fr)]" style={{ height: hours.length * ROW }}>
                <div>{hours.map((hr) => <div key={hr} style={{ height: ROW }} className="pr-2 pt-1 text-right text-[11px] text-muted tabular-nums">{hr % 12 === 0 ? 12 : hr % 12}{hr < 12 ? 'am' : 'pm'}</div>)}</div>
                {days.map((d) => (
                  <div key={d.toISOString()} className={cx('relative border-l border-line', ymd(d) === today && 'bg-primary-soft/30')}>
                    {hours.map((hr) => (
                      <div key={hr} style={{ height: ROW }} className="border-t border-line first:border-t-0">
                        {[false, true].map((half) => <button key={String(half)} aria-label={`Book ${d.toDateString()} ${hr}:${half ? '30' : '00'}`} onClick={() => pickSlot(d, hr, half)} className="block h-1/2 w-full text-left hover:bg-primary/10 focus-visible:bg-primary/10" />)}
                      </div>))}
                    {(byDay[ymd(d)] ?? []).map((e) => {
                      const s = parse(e.start), en = parse(e.end);
                      const top = ((s.getHours() * 60 + s.getMinutes()) - h.start * 60) / 60 * ROW; const height = Math.max(18, ((en.getTime() - s.getTime()) / 3600000) * ROW - 2);
                      const cls = e.type === 'class' ? 'rb-class text-ink' : e.type === 'maintenance' ? 'rb-maint text-ink' : e.mine ? 'rb-mine text-surface' : e.status === 'pending' ? 'rb-pending text-[#2a1d00]' : 'rb-booked text-on-primary';
                      return (
                        <div key={e.id} title={`${e.title} ${fmtTime(e.start)}–${fmtTime(e.end)}`} style={{ top, height }}
                          onClick={() => e.bookingId && e.mine && nav(`/app/bookings/${e.bookingId}`)}
                          className={cx('absolute inset-x-0.5 overflow-hidden rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-tight', cls, e.mine && 'cursor-pointer')}>
                          <span className="block truncate rounded-sm bg-black/0">{e.title}</span>{height > 34 && <span className="block opacity-80">{fmtTime(e.start)}</span>}
                        </div>);
                    })}
                  </div>))}
              </div>
            </div>
          </div>
        </Card>)}
    </div>
  );
}
