import { ArrowLeft, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CancelModal, refreshCounts, useBase } from '../../components/bookingBits';
import { useLoad } from '../../components/hooks';
import { Button, Card, ErrorState, Field, Modal, Skeleton, StatusBadge, Textarea } from '../../components/ui';
import { errMsg, get, post } from '../../lib/api';
import { cap, fmtDateTime, fmtDay, fmtHours, fmtRange } from '../../lib/format';
import { useToast } from '../../lib/feedback';
import type { BookingDetail } from '../../lib/types';

export default function BookingDetailPage() {
  const { id } = useParams(); const nav = useNavigate(); const base = useBase(); const toast = useToast();
  const { data: b, loading, error, reload } = useLoad(async () => (await get<BookingDetail>(`/bookings/${id}`)).data, [id]);
  const [cancel, setCancel] = useState(false);
  const [decide, setDecide] = useState<'approved' | 'rejected' | null>(null); const [remarks, setRemarks] = useState(''); const [busy, setBusy] = useState(false);
  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  if (loading || !b) return <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-72" /></div>;

  const submitDecision = async () => {
    setBusy(true);
    try { await post(`/bookings/${b.id}/decision`, { decision: decide, remarks: remarks.trim() || undefined }); toast.success(decide === 'approved' ? 'Booking approved' : 'Booking rejected'); refreshCounts(); setDecide(null); setRemarks(''); reload(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const row = (k: string, v: React.ReactNode) => <div className="flex justify-between gap-4 py-3 text-sm"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>;

  return (
    <div>
      <button onClick={() => nav(-1)} className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft className="size-4" />Back</button>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div><div className="flex flex-wrap items-center gap-3"><h1 className="text-[30px]">{b.resourceName}</h1><StatusBadge status={b.status} /></div>
          <p className="mt-1.5 text-muted">{b.bookingCode} · {fmtDay(b.startTime)}, {fmtRange(b.startTime, b.endTime)}</p></div>
        <div className="flex gap-2">
          {b.canDecide && <><Button variant="danger" onClick={() => setDecide('rejected')}><XCircle className="size-4" />Reject</Button><Button onClick={() => setDecide('approved')}><CheckCircle2 className="size-4" />Approve</Button></>}
          {b.canCancel && <Button variant="secondary" onClick={() => setCancel(true)}>Cancel booking</Button>}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card className="p-6"><h2 className="mb-1 text-xl">Booking details</h2>
            <dl className="divide-y divide-line">
              {row('Resource', <Link className="text-primary hover:underline" to={`${base}/resources/${b.resourceId}`}>{b.resourceName}</Link>)}
              {row('Location', `${b.buildingName}, room ${b.roomNumber}`)}
              {row('Date and time', `${fmtDay(b.startTime)}, ${fmtRange(b.startTime, b.endTime)} (${fmtHours(b.hours)})`)}
              {row('Attendees', b.attendees)}
              {row('Requested by', `${b.userName} (${cap(b.userRole)})${b.departmentName ? `, ${b.departmentName}` : ''}`)}
              {row('Requested on', fmtDateTime(b.createdAt))}
              {b.cancelReason && row('Cancellation reason', b.cancelReason)}
            </dl>
            <div className="mt-4 rounded-lg bg-surface-2 p-4 text-sm"><p className="mb-1 font-semibold">Purpose</p><p className="text-muted">{b.purpose}</p></div>
          </Card>
          {b.decision && <Card className="p-6"><h2 className="mb-2 text-xl">Admin decision</h2><p className="text-sm"><b>{cap(b.decision)}</b> by {b.decidedByName ?? 'an administrator'}{b.decidedAt ? ` on ${fmtDateTime(b.decidedAt)}` : ''}</p>{b.decisionRemarks && <p className="mt-2 text-sm text-muted">“{b.decisionRemarks}”</p>}</Card>}
          {b.equipment.length > 0 && <Card className="p-6"><h2 className="mb-3 text-xl">Equipment requested</h2><ul className="divide-y divide-line text-sm">{b.equipment.map((e) => <li key={e.id} className="flex justify-between py-2"><span>{e.name} <span className="text-muted">{e.assetTag}</span></span><span className="font-medium">× {e.quantity}</span></li>)}</ul></Card>}
        </div>
        <Card className="h-fit p-6">
          <h2 className="mb-4 text-xl">Status timeline</h2>
          <ol className="relative space-y-5 border-l border-line pl-5">
            {b.history.map((h) => (
              <li key={h.id} className="relative"><span className="absolute -left-[26px] top-1 grid size-3 place-items-center rounded-full bg-primary ring-4 ring-surface"><Clock className="hidden" /></span>
                <p className="text-sm font-semibold">{h.oldStatus ? `${cap(h.oldStatus)} → ${cap(h.newStatus)}` : `Created as ${cap(h.newStatus)}`}</p>
                <p className="text-xs text-muted">{fmtDateTime(h.changedAt)}{h.changedByName ? ` · ${h.changedByName}` : ''}</p></li>))}
            {b.history.length === 0 && <li className="text-sm text-muted">No history recorded.</li>}
          </ol>
        </Card>
      </div>
      <CancelModal open={cancel} onClose={() => setCancel(false)} bookingId={b.id} admin={b.userId !== undefined && base === '/admin'} onDone={reload} />
      <Modal open={!!decide} onClose={() => setDecide(null)} title={decide === 'approved' ? 'Approve this booking?' : 'Reject this booking?'} size="sm"
        footer={<><Button variant="ghost" onClick={() => setDecide(null)}>Back</Button><Button variant={decide === 'rejected' ? 'danger' : 'primary'} loading={busy} onClick={submitDecision}>{decide === 'approved' ? 'Approve' : 'Reject'}</Button></>}>
        <Field label={decide === 'rejected' ? 'Reason (required)' : 'Remarks (optional)'} htmlFor="dec"><Textarea id="dec" value={remarks} maxLength={255} onChange={(e) => setRemarks(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}
