import { ArrowLeft, Building2, CalendarPlus, ClipboardList, Cpu, Flag, Users, Wrench } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DayAvailability, useDayEvents } from '../../components/DayAvailability';
import { useLoad } from '../../components/hooks';
import { useBase } from '../../components/bookingBits';
import { categoryIcon } from '../../components/icons';
import { Badge, Button, Card, ErrorState, Field, Input, Modal, Select, Skeleton, StatusBadge, Textarea } from '../../components/ui';
import { errMsg, get, post } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fmtDateTime, fmtDay, fmtRange, todayStr } from '../../lib/format';
import { useToast } from '../../lib/feedback';
import type { ResourceDetail } from '../../lib/types';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function ResourceDetailPage() {
  const { id } = useParams(); const nav = useNavigate(); const base = useBase(); const { user } = useAuth(); const toast = useToast();
  const { data: r, loading, error, reload } = useLoad(async () => (await get<ResourceDetail>(`/resources/${id}`)).data, [id]);
  const [date, setDate] = useState(todayStr());
  const day = useDayEvents(r ? r.id : null, date);
  const [report, setReport] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium' }); const [busy, setBusy] = useState(false);

  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  if (loading || !r) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-64" /></div>;
  const Icon = categoryIcon(r.categoryIcon);
  const canBook = r.status !== 'retired' && user!.role !== 'admin';

  const submitReport = async () => {
    if (form.title.trim().length < 3) { toast.error('Describe the problem in a few words'); return; }
    setBusy(true);
    try { await post('/maintenance/report', { resourceId: r.id, ...form }); toast.success('Issue reported. The admin office has been notified.'); setReport(false); setForm({ title: '', description: '', priority: 'medium' }); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <div>
      <button onClick={() => nav(-1)} className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft className="size-4" />Back</button>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-5">
        <div className="flex items-start gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary"><Icon className="size-7" aria-hidden /></span>
          <div><div className="flex flex-wrap items-center gap-3"><h1 className="text-[30px] sm:text-[36px]">{r.name}</h1><StatusBadge status={r.status} /></div>
            <p className="mt-1.5 text-muted">{r.categoryName} · {r.code}</p></div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setReport(true)}><Flag className="size-4" />Report an issue</Button>
          {canBook && <Link to={`/app/book/${r.id}`}><Button><CalendarPlus className="size-4" />Book this</Button></Link>}
        </div>
      </div>

      {r.maintenance.length > 0 && (
        <div role="status" className="mb-6 flex gap-3 rounded-xl border border-amber bg-amber-soft p-4 text-sm">
          <Wrench className="mt-0.5 size-5 shrink-0 text-warn" /><div><p className="font-semibold">Maintenance in progress or scheduled</p>
            <ul className="mt-1 space-y-0.5">{r.maintenance.map((m) => <li key={m.id}>{m.title}: {fmtDateTime(m.startsAt)}{m.expectedEnd ? ` until ${fmtDateTime(m.expectedEnd)}` : ' (end date not set)'}. Bookings are blocked in this window.</li>)}</ul></div>
        </div>)}

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-xl">Availability</h2>
            <div className="mb-5 mt-3 max-w-xs"><Field label="Day" htmlFor="day"><Input id="day" type="date" value={date} min={todayStr()} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field></div>
            <DayAvailability events={day.data} loading={day.loading} />
          </Card>
          {r.description && <Card className="p-6"><h2 className="mb-2 text-xl">About this space</h2><p className="max-w-prose text-muted">{r.description}</p></Card>}
          <Card>
            <div className="flex items-center gap-2 border-b border-line px-6 py-4"><Cpu className="size-5 text-primary" /><h2 className="text-xl">Equipment</h2></div>
            {r.equipment.length === 0 ? <p className="px-6 py-8 text-sm text-muted">No equipment is listed for this space.</p> :
              <ul className="divide-y divide-line">{r.equipment.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3"><div><p className="font-medium">{e.name}</p><p className="text-xs text-muted">Quantity {e.quantityTotal} · {e.assetTag}</p></div>
                  <div className="flex gap-2">{e.bookableAddon && <Badge tone="primary" dot={false}>Can be requested</Badge>}<StatusBadge status={e.status} /></div></li>))}</ul>}
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-4 text-xl">Details</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex gap-3"><Building2 className="mt-0.5 size-4 shrink-0 text-muted" /><div><dt className="text-muted">Location</dt><dd className="font-medium">{r.buildingName}, room {r.roomNumber}, floor {r.floorNo}</dd></div></div>
              <div className="flex gap-3"><Users className="mt-0.5 size-4 shrink-0 text-muted" /><div><dt className="text-muted">Capacity</dt><dd className="font-medium">{r.capacity} people</dd></div></div>
              <div className="flex gap-3"><ClipboardList className="mt-0.5 size-4 shrink-0 text-muted" /><div><dt className="text-muted">Booking</dt><dd className="font-medium">{r.requiresApproval ? 'Needs admin approval' : 'Confirms instantly'}</dd></div></div>
              {r.departmentName && <div className="flex gap-3"><Building2 className="mt-0.5 size-4 shrink-0 text-muted" /><div><dt className="text-muted">Managed by</dt><dd className="font-medium">{r.departmentName}</dd></div></div>}
            </dl>
          </Card>
          <Card>
            <div className="border-b border-line px-6 py-4"><h2 className="text-xl">Weekly timetable</h2><p className="mt-0.5 text-xs text-muted">Classes here block ad-hoc bookings</p></div>
            {r.schedules.length === 0 ? <p className="px-6 py-6 text-sm text-muted">No recurring classes.</p> : <ul className="divide-y divide-line text-sm">{r.schedules.map((s) => <li key={s.id} className="flex justify-between gap-3 px-6 py-2.5"><span className="min-w-0 truncate"><b className="font-semibold">{s.courseCode}</b> {s.courseName}</span><span className="shrink-0 text-muted">{DAYS[s.dayOfWeek].slice(0, 3)} {s.startTime}–{s.endTime}</span></li>)}</ul>}
          </Card>
          <Card>
            <div className="border-b border-line px-6 py-4"><h2 className="text-xl">Next two weeks</h2></div>
            {r.upcomingBookings.length === 0 ? <p className="px-6 py-6 text-sm text-muted">No upcoming bookings.</p> : <ul className="divide-y divide-line text-sm">{r.upcomingBookings.map((b) => <li key={b.id} className="flex justify-between gap-3 px-6 py-2.5"><span>{fmtDay(b.startTime)} {b.mine && <Badge tone="primary" dot={false}>Yours</Badge>}</span><span className="tabular-nums text-muted">{fmtRange(b.startTime, b.endTime)}</span></li>)}</ul>}
          </Card>
        </div>
      </div>

      <Modal open={report} onClose={() => setReport(false)} title="Report an issue" footer={<><Button variant="ghost" onClick={() => setReport(false)}>Cancel</Button><Button loading={busy} onClick={submitReport}>Send report</Button></>}>
        <div className="space-y-4">
          <p className="text-sm text-muted">Reports go to the admin office. They do not block bookings until an administrator schedules maintenance.</p>
          <Field label="What is wrong?" htmlFor="rt"><Input id="rt" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="For example: projector flickers" maxLength={150} /></Field>
          <Field label="Priority" htmlFor="rp"><Select id="rp" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></Select></Field>
          <Field label="Details (optional)" htmlFor="rd"><Textarea id="rd" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        </div>
      </Modal>
      <span hidden>{base}</span>
    </div>
  );
}
