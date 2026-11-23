import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Spinner } from './components/ui';
import { AppLayout } from './layouts/AppLayout';
import { GuestOnly, RequireRole } from './layouts/guards';

const Landing = lazy(() => import('./pages/public/Landing'));
const AuthPages = {
  Login: lazy(() => import('./pages/public/Login')),
  Register: lazy(() => import('./pages/public/Register')),
  Forgot: lazy(() => import('./pages/public/Forgot')),
  Reset: lazy(() => import('./pages/public/Reset')),
};
const Overview = lazy(() => import('./pages/app/Overview'));
const Browse = lazy(() => import('./pages/app/Browse'));
const ResourceDetailPage = lazy(() => import('./pages/app/ResourceDetail'));
const CalendarPage = lazy(() => import('./pages/app/CalendarPage'));
const BookPage = lazy(() => import('./pages/app/Book'));
const MyBookings = lazy(() => import('./pages/app/MyBookings'));
const BookingDetailPage = lazy(() => import('./pages/app/BookingDetail'));
const Notifications = lazy(() => import('./pages/app/Notifications'));
const Profile = lazy(() => import('./pages/app/Profile'));

const AdminOverview = lazy(() => import('./pages/admin/AdminOverview'));
const Approvals = lazy(() => import('./pages/admin/Approvals'));
const ResourcesAdmin = lazy(() => import('./pages/admin/ResourcesAdmin'));
const EquipmentAdmin = lazy(() => import('./pages/admin/EquipmentAdmin'));
const MaintenanceAdmin = lazy(() => import('./pages/admin/MaintenanceAdmin'));
const UsersAdmin = lazy(() => import('./pages/admin/UsersAdmin'));
const Reports = lazy(() => import('./pages/admin/Reports'));
const AuditLogs = lazy(() => import('./pages/admin/AuditLogs'));
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage'));

export default function App() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center"><Spinner /></div>}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route element={<GuestOnly />}>
          <Route path="/login" element={<AuthPages.Login />} />
          <Route path="/register" element={<AuthPages.Register />} />
          <Route path="/forgot-password" element={<AuthPages.Forgot />} />
        </Route>
        <Route path="/reset-password" element={<AuthPages.Reset />} />

        <Route element={<RequireRole roles={['student', 'faculty']} />}>
          <Route path="/app" element={<AppLayout />}>
            <Route index element={<Overview />} />
            <Route path="resources" element={<Browse />} />
            <Route path="resources/:id" element={<ResourceDetailPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="book" element={<BookPage />} />
            <Route path="book/:resourceId" element={<BookPage />} />
            <Route path="bookings" element={<MyBookings scope="current" />} />
            <Route path="history" element={<MyBookings scope="history" />} />
            <Route path="bookings/:id" element={<BookingDetailPage />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="profile" element={<Profile />} />
          </Route>
        </Route>

        <Route element={<RequireRole roles={['admin']} />}>
          <Route path="/admin" element={<AppLayout />}>
            <Route index element={<AdminOverview />} />
            <Route path="approvals" element={<Approvals />} />
            <Route path="resources" element={<ResourcesAdmin mode="all" />} />
            <Route path="labs" element={<ResourcesAdmin mode="lab" />} />
            <Route path="classrooms" element={<ResourcesAdmin mode="room" />} />
            <Route path="equipment" element={<EquipmentAdmin />} />
            <Route path="maintenance" element={<MaintenanceAdmin />} />
            <Route path="users" element={<UsersAdmin />} />
            <Route path="reports" element={<Reports />} />
            <Route path="audit" element={<AuditLogs />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="bookings/:id" element={<BookingDetailPage />} />
            <Route path="resources/:id" element={<ResourceDetailPage />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="profile" element={<Profile />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
