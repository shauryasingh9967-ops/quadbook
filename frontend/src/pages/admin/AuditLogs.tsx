import { DatabaseZap, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { useLoad } from '../../components/hooks';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Pagination, SearchInput, Select, Skeleton, Stat, Table, Tabs, Td } from '../../components/ui';
import { errCode, get } from '../../lib/api';
import { cap, fmtDateTime } from '../../lib/format';

interface Activity { _id: string; userName?: string; userEmail?: string; role?: string; action: string; category: string; description?: string; success: boolean; ip?: string; createdAt: string }
interface BAudit { _id: string; bookingCode?: string; event: string; actorName?: string; actorRole?: string; resourceName?: string; note?: string; createdAt: string }
interface Summary { byCategory: Array<{ category: string; count: number }>; bookingEvents: Array<{ event: string; count: number }>; totals: { activityLogs: number; bookingAudit: number; notificationHistory: number }; failedLoginsLast7Days: number }

function Unavailable() {
  return <EmptyState icon={<DatabaseZap className="size-6" />} title="Audit store is offline" body="MongoDB is not reachable right now. Logs queued in memory are written once it reconnects. The rest of the app keeps working." />;
}

export default function AuditLogs() {
  const [tab, setTab] = useState<'activity' | 'bookings' | 'summary'>('summary');
  const [q, setQ] = useState(''); const [cat, setCat] = useState(''); const [ok, setOk] = useState(''); const [ev, setEv] = useState(''); const [page, setPage] = useState(1);
  const sum = useLoad(async () => (await get<Summary>('/admin/audit/summary')).data, []);
  const act = useLoad(async () => tab === 'activity' ? get<Activity[]>('/admin/audit/activity', { q: q || undefined, category: cat || undefined, success: ok || undefined, page, limit: 12 }) : null, [tab, q, cat, ok, page]);
  const ba = useLoad(async () => tab === 'bookings' ? get<BAudit[]>('/admin/audit/bookings', { q: q || undefined, event: ev || undefined, page, limit: 12 }) : null, [tab, q, ev, page]);
  const down = [sum.error, act.error, ba.error].some((e) => e && /unavailable|offline|503/i.test(e)) || [sum, act, ba].some((x) => x.error && errCode(x.error) === 'MONGO_UNAVAILABLE');
  const reset = () => { setPage(1); };
  return (
    <div>
      <PageHeader title="Audit logs" subtitle="Activity, booking audit trail and notification history, stored in MongoDB." />
      <div className="mb-4"><Tabs value={tab} onChange={(v) => { setTab(v); setPage(1); setQ(''); }} items={[{ value: 'summary', label: 'Summary' }, { value: 'activity', label: 'User activity' }, { value: 'bookings', label: 'Booking audit' }]} /></div>
      {tab === 'summary' && (sum.error ? <Card>{down ? <Unavailable /> : <ErrorState message={sum.error} onRetry={sum.reload} />}</Card> : !sum.data ? <Skeleton className="h-48" /> : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Activity entries" value={sum.data.totals.activityLogs.toLocaleString()} /><Stat label="Booking audit entries" value={sum.data.totals.bookingAudit.toLocaleString()} /><Stat label="Notifications archived" value={sum.data.totals.notificationHistory.toLocaleString()} /><Stat label="Failed logins, 7 days" value={sum.data.failedLoginsLast7Days} icon={<ShieldAlert className="size-5" />} /></div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-6"><h2 className="mb-3 text-xl">Activity by category, 7 days</h2><ul className="space-y-2 text-sm">{sum.data.byCategory.map((c) => <li key={c.category} className="flex items-center gap-3"><span className="w-24 capitalize text-muted">{c.category}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-primary" style={{ width: `${(c.count / Math.max(...sum.data!.byCategory.map((x) => x.count))) * 100}%` }} /></div><b className="w-10 text-right tabular-nums">{c.count}</b></li>)}</ul></Card>
            <Card className="p-6"><h2 className="mb-3 text-xl">Booking events</h2><ul className="space-y-2 text-sm">{sum.data.bookingEvents.map((c) => <li key={c.event} className="flex items-center gap-3"><span className="w-32 text-muted">{cap(c.event)}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-info" style={{ width: `${(c.count / Math.max(...sum.data!.bookingEvents.map((x) => x.count))) * 100}%` }} /></div><b className="w-10 text-right tabular-nums">{c.count}</b></li>)}</ul></Card>
          </div>
        </div>))}
      {tab === 'activity' && (<>
        <div className="mb-4 flex flex-wrap gap-3"><SearchInput value={q} onChange={(v) => { setQ(v); reset(); }} placeholder="Search user, action or description" className="min-w-[220px] flex-1" />
          <Select aria-label="Category" value={cat} onChange={(e) => { setCat(e.target.value); reset(); }} className="!w-auto"><option value="">All categories</option>{['auth', 'booking', 'resource', 'user', 'maintenance', 'system'].map((c) => <option key={c} value={c}>{cap(c)}</option>)}</Select>
          <Select aria-label="Result" value={ok} onChange={(e) => { setOk(e.target.value); reset(); }} className="!w-auto"><option value="">Any result</option><option value="true">Succeeded</option><option value="false">Failed</option></Select></div>
        <Card>{act.error ? (down ? <Unavailable /> : <ErrorState message={act.error} onRetry={act.reload} />) : !act.data?.data ? <div className="p-5"><Skeleton className="h-64" /></div> : act.data.data.length === 0 ? <EmptyState title="No entries match" /> : (
          <Table head={['When', 'Who', 'Action', 'Details', 'Result']}>{act.data.data.map((r) => <tr key={r._id} className="border-b border-line last:border-0 align-top"><Td className="whitespace-nowrap text-[13px] text-muted">{fmtDateTime(r.createdAt.slice(0, 19))}</Td><Td><p className="font-medium">{r.userName ?? 'Anonymous'}</p><p className="text-xs text-muted">{r.userEmail}</p></Td><Td><code className="text-[13px]">{r.action}</code></Td><Td className="max-w-xs text-[13px] text-muted">{r.description}</Td><Td><Badge tone={r.success ? 'ok' : 'bad'}>{r.success ? 'OK' : 'Failed'}</Badge></Td></tr>)}</Table>)}
          {act.data?.meta && <Pagination page={act.data.meta.page} totalPages={act.data.meta.totalPages} total={act.data.meta.total} limit={act.data.meta.limit} onPage={setPage} />}</Card></>)}
      {tab === 'bookings' && (<>
        <div className="mb-4 flex flex-wrap gap-3"><SearchInput value={q} onChange={(v) => { setQ(v); reset(); }} placeholder="Search code, actor or resource" className="min-w-[220px] flex-1" />
          <Select aria-label="Event" value={ev} onChange={(e) => { setEv(e.target.value); reset(); }} className="!w-auto"><option value="">All events</option>{['created', 'updated', 'approved', 'rejected', 'cancelled', 'conflict_blocked', 'auto_cancelled'].map((c) => <option key={c} value={c}>{cap(c)}</option>)}</Select></div>
        <Card>{ba.error ? (down ? <Unavailable /> : <ErrorState message={ba.error} onRetry={ba.reload} />) : !ba.data?.data ? <div className="p-5"><Skeleton className="h-64" /></div> : ba.data.data.length === 0 ? <EmptyState title="No entries match" /> : (
          <Table head={['When', 'Booking', 'Event', 'Actor', 'Resource', 'Note']}>{ba.data.data.map((r) => <tr key={r._id} className="border-b border-line last:border-0 align-top"><Td className="whitespace-nowrap text-[13px] text-muted">{fmtDateTime(r.createdAt.slice(0, 19))}</Td><Td className="font-medium">{r.bookingCode ?? '-'}</Td><Td><Badge tone={r.event === 'conflict_blocked' ? 'bad' : r.event === 'approved' ? 'ok' : r.event === 'created' ? 'primary' : 'neutral'}>{cap(r.event)}</Badge></Td><Td>{r.actorName}<p className="text-xs capitalize text-muted">{r.actorRole}</p></Td><Td className="text-muted">{r.resourceName}</Td><Td className="max-w-xs text-[13px] text-muted">{r.note}</Td></tr>)}</Table>)}
          {ba.data?.meta && <Pagination page={ba.data.meta.page} totalPages={ba.data.meta.totalPages} total={ba.data.meta.total} limit={ba.data.meta.limit} onPage={setPage} />}</Card></>)}
    </div>
  );
}
