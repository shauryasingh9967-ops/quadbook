import { CalendarPlus, History, Inbox } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookingRow, CancelModal, useBase } from '../../components/bookingBits';
import { useLoad } from '../../components/hooks';
import { Button, Card, EmptyState, ErrorState, PageHeader, Pagination, SearchInput, Select, Skeleton, Tabs } from '../../components/ui';
import { get } from '../../lib/api';
import type { Booking } from '../../lib/types';

export default function MyBookings({ scope }: { scope: 'current' | 'history' }) {
  const base = useBase();
  const [status, setStatus] = useState('all'); const [q, setQ] = useState(''); const [page, setPage] = useState(1); const [sort, setSort] = useState('start_asc');
  const [cancel, setCancel] = useState<Booking | null>(null);
  const history = scope === 'history';
  const { data, loading, error, reload } = useLoad(async () => get<Booking[]>('/bookings', {
    scope: history ? 'history' : 'upcoming', status: status === 'all' ? undefined : status, q: q || undefined, page, limit: 8, sort: history ? 'start_desc' : sort,
  }), [scope, status, q, page, sort]);
  const tabs = history
    ? [{ value: 'all', label: 'All' }, { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' }, { value: 'rejected', label: 'Rejected' }]
    : [{ value: 'all', label: 'All' }, { value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }];
  const rows = data?.data ?? []; const meta = data?.meta;
  return (
    <div>
      <PageHeader title={history ? 'Booking history' : 'My bookings'} subtitle={history ? 'Past and closed bookings.' : 'Upcoming and pending bookings. Cancel any that you no longer need.'}
        actions={!history && <Link to={`${base}/resources`}><Button><CalendarPlus className="size-4" />New booking</Button></Link>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={tabs} />
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search by resource, code or purpose" className="min-w-[220px] flex-1" />
        {!history && <Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)} className="!w-auto"><option value="start_asc">Soonest first</option><option value="newest">Recently created</option></Select>}
      </div>
      <Card>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div> :
          rows.length === 0 ? <EmptyState icon={history ? <History className="size-6" /> : <Inbox className="size-6" />} title={history ? 'No past bookings match' : 'Nothing booked yet'} body={history ? 'Closed bookings will appear here.' : 'Browse resources and book your first slot.'} action={!history && <Link to={`${base}/resources`}><Button>Browse resources</Button></Link>} /> : (
            <div className="divide-y divide-line">
              {rows.map((b) => <BookingRow key={b.id} b={b} actions={!history && ['pending', 'approved'].includes(b.status) ? <Button size="sm" variant="secondary" onClick={() => setCancel(b)}>Cancel</Button> : null} />)}
            </div>)}
        {meta && <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} limit={meta.limit} onPage={setPage} />}
      </Card>
      {cancel && <CancelModal open onClose={() => setCancel(null)} bookingId={cancel.id} onDone={reload} />}
    </div>
  );
}
