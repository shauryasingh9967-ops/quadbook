import { CalendarClock, MapPin, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errMsg, post } from '../lib/api';
import { fmtDay, fmtRange } from '../lib/format';
import { useToast } from '../lib/feedback';
import { useAuth } from '../lib/auth';
import type { Booking } from '../lib/types';
import { categoryIcon } from './icons';
import { Button, Field, Modal, StatusBadge, Textarea } from './ui';

export const useBase = () => (useAuth().user?.role === 'admin' ? '/admin' : '/app');
export const refreshCounts = () => window.dispatchEvent(new Event('sc:counts'));

export function BookingRow({ b, showUser, actions }: { b: Booking; showUser?: boolean; actions?: React.ReactNode }) {
  const base = useBase();
  const Icon = categoryIcon(b.categoryKind === 'lab' ? 'monitor' : b.categoryKind === 'hall' ? 'mic' : b.categoryKind === 'equipment' ? 'camera' : 'presentation');
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 sm:px-5">
      <span className="hidden size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary sm:grid"><Icon className="size-5" aria-hidden /></span>
      <div className="min-w-0 flex-1 basis-60">
        <Link to={`${base}/bookings/${b.id}`} className="block truncate font-semibold hover:text-primary hover:underline">{b.resourceName}</Link>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
          <span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" />{fmtDay(b.startTime)}, {fmtRange(b.startTime, b.endTime)}</span>
          <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{b.buildingCode} {b.roomNumber}</span>
          <span className="inline-flex items-center gap-1"><Users className="size-3.5" />{b.attendees}</span>
        </p>
        <p className="mt-1 truncate text-[13px] text-muted">{showUser ? <><b className="font-semibold text-ink">{b.userName}</b> · </> : null}{b.purpose}</p>
      </div>
      <div className="flex items-center gap-3"><span className="hidden text-xs tabular-nums text-muted md:inline">{b.bookingCode}</span><StatusBadge status={b.status} />{actions}</div>
    </div>
  );
}

export function CancelModal({ open, onClose, bookingId, admin, onDone }: { open: boolean; onClose: () => void; bookingId: number; admin?: boolean; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await post(`/bookings/${bookingId}/cancel`, { reason: reason.trim() || undefined }); toast.success('Booking cancelled'); refreshCounts(); setReason(''); onDone(); onClose(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Cancel this booking?" size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Keep booking</Button><Button variant="danger" loading={busy} onClick={submit}>Cancel booking</Button></>}>
      <p className="mb-4 text-sm text-muted">{admin ? 'The requester will be notified.' : 'The slot is released straight away so others can book it.'}</p>
      <Field label="Reason (optional)" htmlFor="cancel-reason"><Textarea id="cancel-reason" maxLength={255} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: exam clash" /></Field>
    </Modal>
  );
}
