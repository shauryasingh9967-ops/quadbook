import { motion } from 'framer-motion';
import { ArrowRight, CalendarCheck2, ClipboardCheck, FileSearch, Layers, ShieldCheck, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LiveBoard } from '../../components/LiveBoard';
import { Brand } from '../../components/Logo';
import { ThemeToggle } from '../../components/ThemeToggle';
import { Button, StatusBadge } from '../../components/ui';
import { categoryIcon } from '../../components/icons';
import { get } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { homeFor } from '../../layouts/guards';

interface Overview {
  stats: { resources: number; buildings: number; users: number; bookings: number; hours: number };
  resources: Array<{ id: number; code: string; name: string; capacity: number; status: string; categoryName: string; categoryIcon: string; buildingName: string; roomNumber: string; equipmentCount: number }>;
}

export default function Landing() {
  const { user } = useAuth();
  const [o, setO] = useState<Overview | null>(null);
  useEffect(() => { get<Overview>('/public/overview').then((r) => setO(r.data)).catch(() => undefined); }, []);
  const cta = user ? { to: homeFor(user.role), label: 'Open your dashboard' } : { to: '/register', label: 'Create an account' };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-6 px-5">
          <Link to="/" aria-label="QuadBook home"><Brand /></Link>
          <nav aria-label="Sections" className="ml-4 hidden items-center gap-6 text-sm font-medium text-muted md:flex">
            <a href="#features" className="hover:text-ink">Features</a><a href="#how" className="hover:text-ink">How it works</a><a href="#spaces" className="hover:text-ink">Spaces</a>
          </nav>
          <div className="flex-1" />
          <ThemeToggle />
          {user ? <Link to={homeFor(user.role)}><Button size="sm">Dashboard</Button></Link> : <>
            <Link to="/login" className="hidden text-sm font-semibold hover:text-primary sm:block">Sign in</Link>
            <Link to="/register"><Button size="sm">Get started</Button></Link></>}
        </div>
      </header>

      <section className="mx-auto grid max-w-[1180px] items-center gap-12 px-5 pb-20 pt-14 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-20">
        <div>
          <h1 className="text-[clamp(38px,6vw,64px)] font-bold leading-[1.02] tracking-[-0.035em]">Every lab, hall and kit on campus, booked in minutes.</h1>
          <p className="mt-6 max-w-xl text-lg text-muted">See what is free right now, request a slot, and get a decision without chasing anyone. Overlaps, maintenance and timetabled classes are checked for you before a request is ever sent.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to={cta.to}><Button size="lg">{cta.label}<ArrowRight className="size-4" /></Button></Link>
            <a href="#spaces"><Button size="lg" variant="secondary">See the spaces</Button></a>
          </div>
          {o && <p className="mt-8 max-w-lg text-sm text-muted">Running {o.stats.resources} bookable spaces across {o.stats.buildings} buildings, with {o.stats.bookings.toLocaleString()} bookings completed or confirmed so far.</p>}
        </div>
        <LiveBoard />
      </section>

      <section id="features" className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-[1180px] gap-12 px-5 py-20 lg:grid-cols-[0.8fr_1.4fr]">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <h2 className="text-[34px] sm:text-[40px]">Built around how booking actually goes wrong</h2>
            <p className="mt-4 max-w-md text-muted">Double bookings, forgotten maintenance and unclear approvals cost faculty and students hours every semester. Each feature below removes one of those.</p>
          </div>
          <dl className="divide-y divide-line border-y border-line">
            {[
              [CalendarCheck2, 'No double bookings', 'The database itself refuses overlapping slots, even if two people press Book at the same instant.'],
              [Layers, 'Timetable aware', 'Recurring lectures and lab sessions block their slots, so ad-hoc requests only ever land in genuinely free time.'],
              [Wrench, 'Maintenance aware', 'When a resource goes out of service, affected bookings are cancelled and their owners are told straight away.'],
              [ClipboardCheck, 'Clear approvals', 'Requests wait in one queue for the admin office. Every decision carries remarks you can read later.'],
              [FileSearch, 'Full audit trail', 'Every sign-in, booking change and approval is written to a separate activity log that cannot be edited from the app.'],
              [ShieldCheck, 'Role-based access', 'Students, faculty and administrators see only what they are allowed to, enforced on the server.'],
            ].map(([Icon, t, d]) => { const I = Icon as typeof Layers; return (
              <div key={t as string} className="grid gap-2 py-6 sm:grid-cols-[220px_1fr] sm:gap-8">
                <dt className="flex items-center gap-3 font-display text-lg font-semibold"><I className="size-5 text-primary" aria-hidden />{t as string}</dt>
                <dd className="text-muted">{d as string}</dd>
              </div>); })}
          </dl>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-[1180px] px-5 py-20">
        <h2 className="max-w-2xl text-[34px] sm:text-[40px]">From “is it free?” to a confirmed slot in four steps</h2>
        <ol className="relative mt-12 grid gap-10 md:grid-cols-4 md:gap-6">
          <div aria-hidden className="absolute left-0 right-0 top-[15px] hidden h-1.5 rounded-full md:block" style={{ background: 'linear-gradient(90deg, var(--primary) 0 22%, var(--amber) 22% 46%, var(--primary) 46% 70%, var(--ribbon-class) 70% 100%)', opacity: 0.35 }} />
          {[['Find a space', 'Filter by type, building and capacity. Resources show their status and equipment up front.'],
            ['Pick a free slot', 'The day’s ribbon shows booked time, classes and maintenance, so you can choose a window that will work.'],
            ['Request it', 'Add the purpose, headcount and any equipment. Open rooms confirm instantly; labs go to the admin office.'],
            ['Get the answer', 'Approval or rejection arrives as a notification with remarks. Cancel any time before the start.']].map(([t, d], i) => (
            <motion.li key={t} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ delay: i * 0.08, duration: 0.4 }} className="relative">
              <span className="relative z-10 mb-5 grid size-8 place-items-center rounded-full bg-primary font-display text-sm font-bold text-on-primary">{i + 1}</span>
              <h3 className="text-xl">{t}</h3><p className="mt-2 text-muted">{d}</p>
            </motion.li>))}
        </ol>
      </section>

      <section id="spaces" className="border-t border-line bg-surface">
        <div className="mx-auto max-w-[1180px] px-5 py-20">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div><h2 className="text-[34px] sm:text-[40px]">Spaces you can book today</h2><p className="mt-3 max-w-xl text-muted">A sample of the catalogue. Sign in to see availability, equipment and the full list.</p></div>
            <Link to={user ? '/app/resources' : '/login'}><Button variant="secondary">Browse everything<ArrowRight className="size-4" /></Button></Link>
          </div>
          <div className="grid gap-x-10 md:grid-cols-2">
            {o?.resources.map((r) => { const I = categoryIcon(r.categoryIcon); return (
              <div key={r.id} className="flex items-center gap-4 border-t border-line py-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><I className="size-5" aria-hidden /></span>
                <div className="min-w-0 flex-1"><p className="truncate font-semibold">{r.name}</p><p className="truncate text-sm text-muted">{r.buildingName}, room {r.roomNumber} · {r.capacity} seats{r.equipmentCount ? ` · ${r.equipmentCount} equipment items` : ''}</p></div>
                <StatusBadge status={r.status} />
              </div>); })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] px-5 py-20">
        <div className="rounded-[22px] bg-primary px-8 py-14 text-on-primary sm:px-14">
          <h2 className="max-w-2xl text-[34px] sm:text-[44px]">Stop emailing for lab slots.</h2>
          <p className="mt-4 max-w-xl text-lg opacity-90">Create an account with your university email and make your first booking today.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to={cta.to}><button className="h-12 rounded-(--radius-ctl) bg-surface px-6 font-semibold text-ink transition-transform active:scale-[0.98]">{cta.label}</button></Link>
            {!user && <Link to="/login"><button className="h-12 rounded-(--radius-ctl) border border-white/40 px-6 font-semibold text-on-primary hover:bg-white/10">Sign in</button></Link>}
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-muted">
          <Brand size={26} /><p>University resource and lab booking · DBMS capstone project</p>
        </div>
      </footer>
    </div>
  );
}
