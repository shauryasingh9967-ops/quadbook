import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spinner } from '../components/ui';
import { useAuth } from '../lib/auth';
import type { Role } from '../lib/types';

export const homeFor = (role: Role) => (role === 'admin' ? '/admin' : '/app');

export function RequireRole({ roles }: { roles: Role[] }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="grid min-h-screen place-items-center"><Spinner label="Checking your session" /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />; // UI courtesy only; the API enforces access too
  return <Outlet />;
}

export function GuestOnly() {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid min-h-screen place-items-center"><Spinner /></div>;
  if (user) return <Navigate to={homeFor(user.role)} replace />;
  return <Outlet />;
}
