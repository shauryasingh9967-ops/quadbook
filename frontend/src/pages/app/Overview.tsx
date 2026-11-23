import { motion } from 'framer-motion';
import { ArrowRight, Bell, CalendarCheck2, Clock3, Hourglass, PlusCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BookingRow } from '../../components/bookingBits';
import { useLoad } from '../../components/hooks';
import { Button, Card, EmptyState, ErrorState, Skeleton, Stat } from '../../components/ui';
import { get } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { timeAgo } from '../../lib/format';
import type { Booking } from '../../lib/types';

interface My { counts: Record<string, number>; hoursThisMonth: number; unreadNotifications: number; upcoming: Booking[]; recent: Booking[] }
interface Act { _id: string; action: string; description?: string; createdAt: string }

export default function Overview() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useLoad(async () => (await get<My>('/me/overview')).data, []);
  const act = useLoad(async () => (await get<{ available: boolean; items: Act[] }>('/me/activity')).data, []);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-[30px] sm:text-[36px]">{greet}, {user!.fullName.replace(/^Dr\.\s*/, '').split(' ')[0]}</h1>
          <p className="mt-1.5 text-muted">{user!.role === 'faculty' ? 'Plan your teaching spaces and track every request.' : 'Here is where your bookings stand.'}</p></div>
        <Link to="/app/book"><Button size="lg"><PlusCircle className="size-4" />Book a resource</Button></Link>
      </div>
      {error && <Card><ErrorState message={error} onRetry={reload} /></Card>}
      {loading && !data && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>}
      {data && (<>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Upcoming" value={data.counts.approved} hint="Approved and still to come" icon={<CalendarCheck2 className="size-[18px]" />} />
          <Stat label="Awaiting approval" value={data.counts.pending} hint="Decided by the admin office" icon={<Hourglass className="size-[18px]" />} />
          <Stat label="Hours this month" value={data.hoursThisMonth} hint={`${data.counts.completed} sessions completed overall`} icon={<Clock3 className="size-[18px]" />} />
          <Stat label="Unread notifications" value={data.unreadNotifications} hint={<Link className="font-semibold text-primary hover:underline" to="/app/notifications">Open notifications</Link>} icon={<Bell className="size-[18px]" />} />
        </motion.div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Card>
            <div className="flex items-center justify-between border-b border-line px-5 py-4"><h2 className="text-xl">Coming up</h2><Link to="/app/bookings" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">All bookings<ArrowRight className="size-4" /></Link></div>
            {data.upcoming.length === 0 ? <EmptyState icon={<CalendarCheck2 className="size-6" />} title="Nothing booked yet" body="Find a lab, classroom or kit and reserve a slot." action={<Link to="/app/resources"><Button>Browse resources</Button></Link>} />
              : <div className="divide-y divide-line">{data.upcoming.map((b) => <BookingRow key={b.id} b={b} />)}</div>}
          </Card>
          <div className="space-y-6">
            <Card>
              <div className="border-b border-line px-5 py-4"><h2 className="text-xl">Recent requests</h2></div>
              {data.recent.length === 0 ? <p className="px-5 py-8 text-sm text-muted">Your requests will appear here.</p> :
                <ul className="divide-y divide-line">{data.recent.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm"><Link className="min-w-0 truncate font-medium hover:text-primary hover:underline" to={`/app/bookings/${b.id}`}>{b.resourceName}</Link><span className="shrink-0 text-xs capitalize text-muted">{b.status}</span></li>))}</ul>}
            </Card>
            <Card>
              <div className="border-b border-line px-5 py-4"><h2 className="text-xl">Your recent activity</h2><p className="mt-0.5 text-xs text-muted">From the MongoDB activity log</p></div>
              {act.data && !act.data.available ? <p className="px-5 py-6 text-sm text-muted">The activity log is temporarily unavailable.</p>
                : act.data && act.data.items.length ? <ul className="divide-y divide-line">{act.data.items.slice(0, 5).map((a) => <li key={a._id} className="px-5 py-2.5 text-sm"><p className="truncate">{a.description ?? a.action}</p><p className="text-xs text-muted">{timeAgo(a.createdAt)}</p></li>)}</ul>
                : <p className="px-5 py-6 text-sm text-muted">No activity recorded yet.</p>}
            </Card>
          </div>
        </div>
      </>)}
    </div>
  );
}
