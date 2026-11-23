import { Download } from 'lucide-react';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axis, C, tooltipProps } from '../../components/charts';
import { useLoad } from '../../components/hooks';
import { Button, Card, ErrorState, Field, Input, PageHeader, Select, Skeleton, Stat, Table, Td } from '../../components/ui';
import { api, errMsg, get } from '../../lib/api';
import { addDays, ymd } from '../../lib/format';
import { useToast } from '../../lib/feedback';

interface Bundle {
  utilization: Array<{ id: number; name: string; category: string; bookings: number; bookedHours: number; classHours: number; utilizationPct: number }>;
  byCategory: Array<{ category: string; bookings: number; hours: number }>; byDepartment: Array<{ department: string; bookings: number }>;
  byHour: Array<{ hour: number; bookings: number }>; byWeekday: Array<{ day: string; bookings: number }>;
  topUsers: Array<{ fullName: string; role: string; bookings: number; hours: number; rankNo: number }>; statusSplit: Array<{ status: string; bookings: number }>;
  totals: { approvedBookings: number; hours: number };
}
const STATUS_C: Record<string, string> = { approved: C.ok, completed: C.info, pending: C.amber, rejected: C.bad, cancelled: C.muted };
const hr = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`;

export default function Reports() {
  const toast = useToast();
  const [from, setFrom] = useState(ymd(addDays(new Date(), -29))); const [to, setTo] = useState(ymd(new Date())); const [status, setStatus] = useState(''); const [busy, setBusy] = useState(false);
  const bad = from > to;
  const { data, loading, error, reload } = useLoad(async () => bad ? null : (await get<Bundle>('/admin/reports/bundle', { from, to })).data, [from, to]);
  const download = async () => {
    setBusy(true);
    try {
      const r = await api.get('/admin/reports/bookings.csv', { params: { from, to, status: status || undefined }, responseType: 'blob' });
      const url = URL.createObjectURL(r.data as Blob); const a = document.createElement('a'); a.href = url; a.download = `bookings_${from}_${to}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      toast.success('CSV downloaded');
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const total = data?.statusSplit.reduce((a, s) => a + s.bookings, 0) ?? 0;
  return (
    <div>
      <PageHeader title="Reports" subtitle="Usage figures for any date range, straight from the booking tables." actions={<Button variant="secondary" loading={busy} disabled={bad} onClick={download}><Download className="size-4" />Download CSV</Button>} />
      <Card className="mb-6 flex flex-wrap items-end gap-4 p-4">
        <Field label="From" htmlFor="rf"><Input id="rf" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></Field>
        <Field label="To" htmlFor="rt"><Input id="rt" type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} /></Field>
        <Field label="CSV status filter" htmlFor="rs"><Select id="rs" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option><option value="completed">Completed</option></Select></Field>
        <div className="flex gap-2">{[['7 days', 6], ['30 days', 29], ['90 days', 89]].map(([l, d]) => <Button key={l as string} variant="ghost" size="sm" onClick={() => { setFrom(ymd(addDays(new Date(), -(d as number)))); setTo(ymd(new Date())); }}>{l}</Button>)}</div>
      </Card>
      {bad ? <Card><p className="p-6 text-sm text-bad">The start date must be on or before the end date.</p></Card> : error ? <Card><ErrorState message={error} onRetry={reload} /></Card> : loading && !data ? <Skeleton className="h-96" /> : data && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3"><Stat label="Approved bookings" value={data.totals.approvedBookings} /><Stat label="Booked hours" value={data.totals.hours} /><Stat label="All requests in range" value={total} /></div>
          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="p-6"><h2 className="mb-4 text-xl">Busiest hours</h2><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.byHour} margin={{ left: -20 }}><CartesianGrid stroke={C.line} vertical={false} /><XAxis dataKey="hour" tickFormatter={hr} {...axis} /><YAxis {...axis} allowDecimals={false} /><Tooltip {...tooltipProps} labelFormatter={(h) => `${hr(Number(h))} start`} /><Bar name="Bookings" dataKey="bookings" fill={C.primary} radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
            <Card className="p-6"><h2 className="mb-4 text-xl">Busiest weekdays</h2><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.byWeekday} margin={{ left: -20 }}><CartesianGrid stroke={C.line} vertical={false} /><XAxis dataKey="day" {...axis} /><YAxis {...axis} allowDecimals={false} /><Tooltip {...tooltipProps} /><Bar name="Bookings" dataKey="bookings" fill={C.info} radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
            <Card className="p-6"><h2 className="mb-4 text-xl">By department</h2><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.byDepartment} layout="vertical" margin={{ right: 12 }}><CartesianGrid stroke={C.line} horizontal={false} /><XAxis type="number" {...axis} allowDecimals={false} /><YAxis type="category" dataKey="department" width={140} {...axis} tickFormatter={(s: string) => (s.length > 20 ? s.slice(0, 19) + '…' : s)} /><Tooltip {...tooltipProps} /><Bar name="Bookings" dataKey="bookings" fill={C.primary} radius={[0, 5, 5, 0]} barSize={14} /></BarChart></ResponsiveContainer></div></Card>
            <Card className="p-6"><h2 className="mb-2 text-xl">Request outcomes</h2><div className="h-48"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.statusSplit} dataKey="bookings" nameKey="status" innerRadius={45} outerRadius={75} paddingAngle={2} stroke="var(--surface)" strokeWidth={2}>{data.statusSplit.map((s) => <Cell key={s.status} fill={STATUS_C[s.status] ?? C.muted} />)}</Pie><Tooltip {...tooltipProps} /></PieChart></ResponsiveContainer></div>
              <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">{data.statusSplit.map((s) => <li key={s.status} className="flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ background: STATUS_C[s.status] ?? C.muted }} /><span className="capitalize text-muted">{s.status}</span><b className="ml-auto tabular-nums">{s.bookings}</b></li>)}</ul></Card>
          </div>
          <Card><div className="border-b border-line px-6 py-4"><h2 className="text-xl">Resource utilization</h2><p className="text-sm text-muted">Booked hours plus timetable class hours, against open hours (Mon to Sat).</p></div>
            <Table head={['Resource', 'Category', 'Bookings', 'Booked h', 'Class h', 'Utilization']}>
              {[...data.utilization].sort((a, b) => b.utilizationPct - a.utilizationPct).slice(0, 15).map((u) => (
                <tr key={u.id} className="border-b border-line last:border-0"><Td className="font-semibold">{u.name}</Td><Td className="text-muted">{u.category}</Td><Td className="tabular-nums">{u.bookings}</Td><Td className="tabular-nums">{u.bookedHours}</Td><Td className="tabular-nums">{u.classHours}</Td>
                  <Td><div className="flex items-center gap-3"><div className="h-2 w-28 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-primary" style={{ width: `${u.utilizationPct}%` }} /></div><span className="w-12 tabular-nums">{u.utilizationPct}%</span></div></Td></tr>))}
            </Table></Card>
          <Card><div className="border-b border-line px-6 py-4"><h2 className="text-xl">Top users</h2></div>
            <Table head={['Rank', 'Name', 'Role', 'Bookings', 'Hours']}>{data.topUsers.map((u, i) => <tr key={i} className="border-b border-line last:border-0"><Td className="tabular-nums">{u.rankNo}</Td><Td className="font-semibold">{u.fullName}</Td><Td className="capitalize text-muted">{u.role}</Td><Td className="tabular-nums">{u.bookings}</Td><Td className="tabular-nums">{u.hours}</Td></tr>)}</Table></Card>
        </div>)}
    </div>
  );
}
