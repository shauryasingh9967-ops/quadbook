import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell, BookOpen, CalendarDays, ClipboardCheck, FlaskConical, FileBarChart, GraduationCap, History, LayoutDashboard, LogOut, Menu, PackageSearch,
  PlusCircle, ScrollText, Settings, Users, UserCircle2, Wrench, X, Building2, ChevronDown,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Brand } from '../components/Logo';
import { ThemeToggle } from '../components/ThemeToggle';
import { Avatar, cx } from '../components/ui';
import { get } from '../lib/api';
import { useAuth } from '../lib/auth';

interface NavItem { to: string; label: string; icon: typeof Bell; end?: boolean; badge?: 'notif' | 'pending' }
const NAV: Record<string, Array<NavItem | { group: string }>> = {
  student: [
    { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true }, { to: '/app/resources', label: 'Browse resources', icon: PackageSearch },
    { to: '/app/calendar', label: 'Booking calendar', icon: CalendarDays }, { to: '/app/book', label: 'Book a resource', icon: PlusCircle },
    { to: '/app/bookings', label: 'My bookings', icon: BookOpen }, { to: '/app/history', label: 'History', icon: History },
    { to: '/app/notifications', label: 'Notifications', icon: Bell, badge: 'notif' }, { to: '/app/profile', label: 'Profile & settings', icon: UserCircle2 },
  ],
  faculty: [
    { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true }, { to: '/app/resources', label: 'Browse resources', icon: PackageSearch },
    { to: '/app/calendar', label: 'Booking calendar', icon: CalendarDays }, { to: '/app/book', label: 'Book a resource', icon: PlusCircle },
    { to: '/app/bookings', label: 'My bookings', icon: BookOpen }, { to: '/app/history', label: 'Booking history', icon: History },
    { to: '/app/notifications', label: 'Notifications', icon: Bell, badge: 'notif' }, { to: '/app/profile', label: 'Profile', icon: UserCircle2 },
  ],
  admin: [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true }, { to: '/admin/approvals', label: 'Booking approvals', icon: ClipboardCheck, badge: 'pending' },
    { group: 'Catalogue' },
    { to: '/admin/resources', label: 'All resources', icon: Building2 }, { to: '/admin/labs', label: 'Labs', icon: FlaskConical },
    { to: '/admin/classrooms', label: 'Classrooms & halls', icon: GraduationCap }, { to: '/admin/equipment', label: 'Equipment', icon: PackageSearch },
    { to: '/admin/maintenance', label: 'Maintenance', icon: Wrench },
    { group: 'Administration' },
    { to: '/admin/users', label: 'Users', icon: Users }, { to: '/admin/reports', label: 'Reports & analytics', icon: FileBarChart },
    { to: '/admin/audit', label: 'Audit logs', icon: ScrollText }, { to: '/admin/settings', label: 'System settings', icon: Settings },
    { group: 'Account' },
    { to: '/admin/notifications', label: 'Notifications', icon: Bell, badge: 'notif' }, { to: '/admin/profile', label: 'Profile', icon: UserCircle2 },
  ],
};

export function AppLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [counts, setCounts] = useState({ notif: 0, pending: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const role = user!.role;

  useEffect(() => { setOpen(false); setMenu(false); window.scrollTo({ top: 0 }); }, [loc.pathname]);
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const n = (await get<{ unread: number }>('/notifications/unread-count')).data.unread;
        const p = role === 'admin' ? (await get<Record<string, number>>('/bookings/stats')).data.pending : 0;
        if (live) setCounts({ notif: n, pending: p });
      } catch { /* shown elsewhere */ }
    };
    void load();
    const t = setInterval(load, 30000);
    const onChange = () => void load();
    window.addEventListener('sc:counts', onChange);
    return () => { live = false; clearInterval(t); window.removeEventListener('sc:counts', onChange); };
  }, [role, loc.pathname]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);

  const sidebar = (
    <nav aria-label="Main" className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-5">
        <Link to={role === 'admin' ? '/admin' : '/app'}><Brand /></Link>
        <button className="rounded-lg p-1.5 text-muted hover:bg-surface-2 lg:hidden" aria-label="Close menu" onClick={() => setOpen(false)}><X className="size-5" /></button>
      </div>
      <div className="scroll-thin flex-1 space-y-0.5 overflow-y-auto px-3 pb-4 pt-2">
        {NAV[role].map((item, i) => {
          if ('group' in item) return <p key={i} className="px-3 pb-1 pt-5 text-xs font-semibold text-muted">{item.group}</p>;
          const Icon = item.icon;
          const badge = item.badge ? counts[item.badge] : 0;
          return (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={({ isActive }) => cx('group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-surface-2 hover:text-ink')}>
              {({ isActive }) => (<>
                {isActive && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-primary" />}
                <Icon className="size-[18px] shrink-0" aria-hidden />
                <span className="flex-1 truncate">{item.label}</span>
                {badge > 0 && <span className="rounded-full bg-amber px-1.5 py-px text-[11px] font-bold text-[#2a1d00] tabular-nums">{badge > 99 ? '99+' : badge}</span>}
              </>)}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:pl-[260px]">
      <aside className="fixed inset-y-0 left-0 hidden w-[260px] border-r border-line bg-surface lg:block">{sidebar}</aside>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.div className="absolute inset-0 bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.aside className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] border-r border-line bg-surface" initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} transition={{ type: 'tween', duration: 0.2 }}>{sidebar}</motion.aside>
          </div>
        )}
      </AnimatePresence>

      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur sm:px-8">
        <button className="grid size-9 place-items-center rounded-lg border border-line bg-surface lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Menu className="size-5" /></button>
        <div className="flex-1" />
        <ThemeToggle />
        <Link to={role === 'admin' ? '/admin/notifications' : '/app/notifications'} aria-label={`Notifications, ${counts.notif} unread`}
          className="relative grid size-9 place-items-center rounded-lg border border-line bg-surface text-muted hover:text-ink">
          <Bell className="size-[18px]" />
          {counts.notif > 0 && <span className="absolute -right-1 -top-1 grid min-w-[18px] place-items-center rounded-full bg-bad px-1 text-[10px] font-bold leading-[18px] text-white tabular-nums">{counts.notif > 99 ? '99+' : counts.notif}</span>}
        </Link>
        <div className="relative" ref={menuRef}>
          <button onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu} className="flex items-center gap-2.5 rounded-xl border border-line bg-surface py-1 pl-1 pr-2.5 hover:bg-surface-2">
            <Avatar name={user!.fullName} size={30} />
            <span className="hidden text-left leading-tight sm:block"><span className="block max-w-[150px] truncate text-[13px] font-semibold">{user!.fullName}</span><span className="block text-xs capitalize text-muted">{role}</span></span>
            <ChevronDown className="size-4 text-muted" />
          </button>
          <AnimatePresence>
            {menu && (
              <motion.div role="menu" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
                className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-line-strong bg-surface shadow-xl">
                <div className="border-b border-line px-4 py-3"><p className="truncate text-sm font-semibold">{user!.fullName}</p><p className="truncate text-xs text-muted">{user!.email}</p></div>
                <Link role="menuitem" to={role === 'admin' ? '/admin/profile' : '/app/profile'} className="flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-surface-2"><UserCircle2 className="size-4 text-muted" />Profile</Link>
                <button role="menuitem" onClick={async () => { await logout(); nav('/login', { replace: true }); }} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-bad hover:bg-surface-2"><LogOut className="size-4" />Sign out</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1280px] px-4 py-7 sm:px-8 sm:py-9"><Outlet /></main>
    </div>
  );
}
