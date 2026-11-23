import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { refreshCounts, useBase } from '../../components/bookingBits';
import { useLoad } from '../../components/hooks';
import { Button, Card, EmptyState, ErrorState, PageHeader, Pagination, Skeleton, Tabs, cx } from '../../components/ui';
import { del, errMsg, get, patch, post } from '../../lib/api';
import { cap, timeAgo } from '../../lib/format';
import { useToast } from '../../lib/feedback';
import type { Notice } from '../../lib/types';

export default function Notifications() {
  const base = useBase(); const toast = useToast();
  const [tab, setTab] = useState<'all' | 'unread'>('all'); const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useLoad(() => get<Notice[]>('/notifications', { page, limit: 10, unread: tab === 'unread' ? 'true' : undefined }), [tab, page]);
  const unread = (data?.meta?.unread as number | undefined) ?? 0;
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); refreshCounts(); reload(); } catch (e) { toast.error(errMsg(e)); } };
  const link = (n: Notice) => n.bookingId ? `${base}/bookings/${n.bookingId}` : n.maintenanceId && base === '/admin' ? '/admin/maintenance' : null;
  const rows = data?.data ?? []; const meta = data?.meta;
  return (
    <div>
      <PageHeader title="Notifications" subtitle="Confirmations, decisions, cancellations and maintenance updates."
        actions={<Button variant="secondary" disabled={unread === 0} onClick={() => act(async () => { await post('/notifications/read-all'); toast.success('All marked as read'); })}><CheckCheck className="size-4" />Mark all read</Button>} />
      <div className="mb-4"><Tabs value={tab} onChange={(v) => { setTab(v); setPage(1); }} items={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread', count: unread }]} /></div>
      <Card>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div> :
          rows.length === 0 ? <EmptyState icon={<Bell className="size-6" />} title={tab === 'unread' ? 'You are all caught up' : 'No notifications yet'} body="Updates about your bookings will show up here." /> : (
            <ul className="divide-y divide-line">
              {rows.map((n) => { const to = link(n); return (
                <li key={n.id} className={cx('flex items-start gap-3 px-5 py-4', !n.isRead && 'bg-primary-soft/40')}>
                  <span className={cx('mt-2 size-2 shrink-0 rounded-full', n.isRead ? 'bg-transparent' : 'bg-primary')} aria-label={n.isRead ? 'Read' : 'Unread'} />
                  <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{n.title}</p><p className="mt-0.5 text-sm text-muted">{n.message}</p>
                    <p className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-muted"><span>{timeAgo(n.createdAt)}</span><span>{cap(n.type)}</span>{to && <Link to={to} onClick={() => !n.isRead && void patch(`/notifications/${n.id}/read`).then(refreshCounts)} className="font-semibold text-primary hover:underline">View</Link>}</p></div>
                  <div className="flex shrink-0 gap-1">
                    {!n.isRead && <Button size="sm" variant="ghost" onClick={() => act(() => patch(`/notifications/${n.id}/read`))}>Mark read</Button>}
                    <Button size="sm" variant="ghost" aria-label="Delete notification" onClick={() => act(() => del(`/notifications/${n.id}`))}><Trash2 className="size-4" /></Button>
                  </div></li>); })}
            </ul>)}
        {meta && <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} limit={meta.limit} onPage={setPage} />}
      </Card>
    </div>
  );
}
