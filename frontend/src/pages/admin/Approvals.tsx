import { CheckCircle2, ClipboardCheck, XCircle } from 'lucide-react';
import { useState } from 'react';
import { BookingRow, refreshCounts } from '../../components/bookingBits';
import { useLoad } from '../../components/hooks';
import { Button, Card, EmptyState, ErrorState, Field, Modal, PageHeader, Pagination, SearchInput, Select, Skeleton, Tabs, Textarea } from '../../components/ui';
import { errMsg, get, post } from '../../lib/api';
import { useConfirm, useToast } from '../../lib/feedback';
import type { Booking } from '../../lib/types';

export default function Approvals() {
  const toast = useToast(); const confirm = useConfirm();
  const [tab, setTab] = useState('pending'); const [q, setQ] = useState(''); const [kind, setKind] = useState(''); const [page, setPage] = useState(1);
  const [rej, setRej] = useState<Booking | null>(null); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false);
  const { data, loading, error, reload } = useLoad(() => get<Booking[]>('/bookings', { status: tab === 'all' ? undefined : tab, q: q || undefined, kind: kind || undefined, page, limit: 8, sort: tab === 'pending' ? 'start_asc' : 'newest' }), [tab, q, kind, page]);
  const counts = useLoad(async () => (await get<{ pending: number }>('/bookings/stats')).data, [data]);

  const approve = async (b: Booking) => {
    if (!(await confirm({ title: 'Approve this booking?', message: `${b.userName} will get ${b.resourceName} on ${b.startTime.slice(0, 10)}. They are notified straight away.`, confirmLabel: 'Approve' }))) return;
    try { await post(`/bookings/${b.id}/decision`, { decision: 'approved' }); toast.success('Booking approved'); refreshCounts(); reload(); } catch (e) { toast.error(errMsg(e)); reload(); }
  };
  const reject = async () => {
    if (!rej) return;
    if (reason.trim().length < 3) { toast.error('Give the requester a short reason'); return; }
    setBusy(true);
    try { await post(`/bookings/${rej.id}/decision`, { decision: 'rejected', remarks: reason.trim() }); toast.success('Booking rejected'); refreshCounts(); setRej(null); setReason(''); reload(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const rows = data?.data ?? []; const meta = data?.meta;
  return (
    <div>
      <PageHeader title="Approvals" subtitle="Review booking requests. Each decision notifies the requester." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={tab} onChange={(v) => { setTab(v); setPage(1); }} items={[{ value: 'pending', label: 'Pending', count: counts.data?.pending }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }, { value: 'cancelled', label: 'Cancelled' }, { value: 'all', label: 'All' }]} />
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search requester, resource or code" className="min-w-[220px] flex-1" />
        <Select aria-label="Type" value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }} className="!w-auto"><option value="">All types</option><option value="lab">Labs</option><option value="classroom">Classrooms</option><option value="hall">Halls</option><option value="equipment">Equipment</option></Select>
      </div>
      <Card>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div> :
          rows.length === 0 ? <EmptyState icon={<ClipboardCheck className="size-6" />} title={tab === 'pending' ? 'No requests waiting' : 'Nothing matches'} body={tab === 'pending' ? 'New requests from students and faculty will appear here.' : 'Try another filter.'} /> : (
            <div className="divide-y divide-line">{rows.map((b) => (
              <BookingRow key={b.id} b={b} showUser actions={b.status === 'pending' ? <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => { setRej(b); setReason(''); }}><XCircle className="size-4" />Reject</Button><Button size="sm" onClick={() => approve(b)}><CheckCircle2 className="size-4" />Approve</Button></div> : null} />))}</div>)}
        {meta && <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} limit={meta.limit} onPage={setPage} />}
      </Card>
      <Modal open={!!rej} onClose={() => setRej(null)} title="Reject this request" size="sm" footer={<><Button variant="ghost" onClick={() => setRej(null)}>Back</Button><Button variant="danger" loading={busy} onClick={reject}>Reject request</Button></>}>
        <p className="mb-4 text-sm text-muted">{rej?.userName} asked for {rej?.resourceName}.</p>
        <Field label="Reason (shown to the requester)" htmlFor="rej"><Textarea id="rej" value={reason} maxLength={255} onChange={(e) => setReason(e.target.value)} placeholder="For example: reserved for exam preparation" /></Field>
      </Modal>
    </div>
  );
}
