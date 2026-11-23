import { AlertTriangle, CalendarCheck, ClipboardCheck, Gauge, Percent, Users, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { axis, C, tooltipProps } from '../../components/charts';
import { useLoad } from '../../components/hooks';
import { Button, Card, ErrorState, PageHeader, Skeleton, Stat, StatusBadge } from '../../components/ui';
import { get } from '../../lib/api';
import { fmtDay, fmtRange } from '../../lib/format';
import type { Booking } from '../../lib/types';

interface Overview { totals: Record<string, number>; bookings: Record<string, number>; approvalRate: number; maintenance: { reported: number; active: number }; averageUtilization: number }
interface Trend { month: string; label: string; total: number; approved: number; rejected: number; cancelled: number; pending: number }
interface Popular { id: number; name: string; categoryName: string; totalBookings: number; totalHours: number; popularityRank: number }
interface Util { id: number; name: string; utilizationPct: number; kind: string }

export default function AdminOverview() {
  const ov = useLoad(async () => (await get<Overview>('/admin/analytics/overview')).data, []);
  const tr = useLoad(async () => (await get<Trend[]>('/admin/analytics/trends')).data, []);
  const pop = useLoad(async () => (await get<Popular[]>('/admin/analytics/popular')).data, []);
  const ut = useLoad(async () => (await get<Util[]>('/admin/analytics/utilization')).data, []);
  const pend = useLoad(async () => (await get<Booking[]>('/bookings', { status: 'pending', sort: 'start_asc', limit: 5 })).data, []);
  const o = ov.data;
  const split = o ? [{ name: 'Approved', v: o.bookings.approved, c: C.ok }, { name: 'Pending', v: o.bookings.pending, c: C.amber }, { name: 'Rejected', v: o.bookings.rejected, c: C.bad }, { name: 'Cancelled', v: o.bookings.cancelled, c: C.muted }] : [];
  const topUtil = [...(ut.data ?? [])].sort((a, b) => b.utilizationPct - a.utilizationPct).slice(0, 8);

  if (ov.error) return <Card><ErrorState message={ov.error} onRetry={ov.reload} /></Card>;
  return (
    <div>
      <PageHeader title="Campus overview" subtitle="Live figures from the booking database." actions={<Link to="/admin/approvals"><Button><ClipboardCheck className="size-4" />Review approvals{o && o.bookings.pending > 0 ? ` (${o.bookings.pending})` : ''}</Button></Link>} />
      {!o ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Total bookings" value={o.totals.bookings.toLocaleString()} hint={`${o.totals.bookingsToday} scheduled today`} icon={<CalendarCheck className="size-5" />} />
          <Stat label="Pending approvals" value={o.bookings.pending} hint={`Approval rate ${o.approvalRate}%`} icon={<Percent className="size-5" />} />
          <Stat label="Average utilization" value={`${o.averageUtilization}%`} hint="Last 30 days, class hours included" icon={<Gauge className="size-5" />} />
          <Stat label="Active users" value={o.totals.users} hint={`${o.totals.students} students, ${o.totals.faculty} faculty`} icon={<Users className="size-5" />} />
        </div>)}
      {o && (o.maintenance.active > 0 || o.maintenance.reported > 0 || o.totals.resourcesUnderMaintenance > 0) && (
        <Link to="/admin/maintenance" className="mt-4 flex items-center gap-3 rounded-xl border border-amber bg-amber-soft px-4 py-3 text-sm hover:brightness-95">
          <Wrench className="size-5 shrink-0 text-warn" /><span><b>{o.maintenance.reported}</b> new reports and <b>{o.maintenance.active}</b> jobs in progress. {o.totals.resourcesUnderMaintenance} resources are blocked for booking right now.</span>
        </Link>)}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card className="p-6">
          <h2 className="text-xl">Bookings per month</h2><p className="mb-4 text-sm text-muted">By start date, last 12 months</p>
          <div className="h-72">{!tr.data ? <Skeleton className="h-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tr.data} margin={{ left: -18, right: 8, top: 8 }}>
                <CartesianGrid stroke={C.line} vertical={false} /><XAxis dataKey="label" {...axis} /><YAxis {...axis} allowDecimals={false} />
                <Tooltip {...tooltipProps} /><Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
                <Line name="All bookings" dataKey="total" stroke={C.primary} strokeWidth={2.5} dot={{ r: 3 }} />
                <Line name="Approved" dataKey="approved" stroke={C.ok} strokeWidth={1.75} strokeDasharray="5 4" dot={false} />
                <Line name="Rejected" dataKey="rejected" stroke={C.bad} strokeWidth={1.75} strokeDasharray="2 3" dot={false} />
              </LineChart></ResponsiveContainer>)}</div>
        </Card>
        <Card className="p-6">
          <h2 className="text-xl">Booking outcomes</h2><p className="mb-2 text-sm text-muted">All time</p>
          <div className="h-56">{o && <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={split} dataKey="v" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2} stroke="var(--surface)" strokeWidth={2}>{split.map((s) => <Cell key={s.name} fill={s.c} />)}</Pie><Tooltip {...tooltipProps} /></PieChart></ResponsiveContainer>}</div>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">{split.map((s) => <li key={s.name} className="flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ background: s.c }} /><span className="text-muted">{s.name}</span><b className="ml-auto tabular-nums">{s.v}</b></li>)}</ul>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-xl">Most used resources</h2><p className="mb-4 text-sm text-muted">Approved and completed bookings</p>
          <div className="h-72">{!pop.data ? <Skeleton className="h-full" /> : (
            <ResponsiveContainer width="100%" height="100%"><BarChart data={pop.data} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid stroke={C.line} horizontal={false} /><XAxis type="number" {...axis} allowDecimals={false} /><YAxis type="category" dataKey="name" width={150} {...axis} tickFormatter={(s: string) => (s.length > 22 ? s.slice(0, 21) + '…' : s)} />
              <Tooltip {...tooltipProps} /><Bar name="Bookings" dataKey="totalBookings" fill={C.primary} radius={[0, 6, 6, 0]} barSize={16} /></BarChart></ResponsiveContainer>)}</div>
        </Card>
        <Card className="p-6">
          <h2 className="text-xl">Utilization, last 30 days</h2><p className="mb-4 text-sm text-muted">Share of open hours used by bookings and classes</p>
          <div className="h-72">{!ut.data ? <Skeleton className="h-full" /> : (
            <ResponsiveContainer width="100%" height="100%"><BarChart data={topUtil} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid stroke={C.line} horizontal={false} /><XAxis type="number" domain={[0, 100]} unit="%" {...axis} /><YAxis type="category" dataKey="name" width={150} {...axis} tickFormatter={(s: string) => (s.length > 22 ? s.slice(0, 21) + '…' : s)} />
              <Tooltip {...tooltipProps} formatter={(v) => `${v}%`} /><Bar name="Utilization" dataKey="utilizationPct" fill={C.info} radius={[0, 6, 6, 0]} barSize={16} /></BarChart></ResponsiveContainer>)}</div>
        </Card>
      </div>

      <Card className="mt-6">
        <div className="flex items-center justify-between border-b border-line px-6 py-4"><h2 className="text-xl">Waiting for a decision</h2><Link to="/admin/approvals" className="text-sm font-semibold text-primary hover:underline">See all</Link></div>
        {pend.data?.length === 0 ? <p className="flex items-center gap-2 px-6 py-8 text-sm text-muted"><AlertTriangle className="size-4" />No pending requests.</p> : (
          <ul className="divide-y divide-line">{pend.data?.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 text-sm"><div><Link to={`/admin/bookings/${b.id}`} className="font-semibold hover:text-primary hover:underline">{b.resourceName}</Link><p className="text-muted">{b.userName} · {fmtDay(b.startTime)}, {fmtRange(b.startTime, b.endTime)}</p></div><StatusBadge status={b.status} /></li>))}</ul>)}
      </Card>
    </div>
  );
}
