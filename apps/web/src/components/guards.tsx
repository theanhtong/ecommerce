import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '@/lib/auth-context';

export function RequireUser() {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return null;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

export function RequireAdmin() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return <Outlet />;
}
