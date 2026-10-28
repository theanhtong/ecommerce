import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '@/lib/auth-context';

export function RequireUser() {
  const { user, ready, signedOut } = useAuth();
  const location = useLocation();
  if (!ready) return null;
  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={
          signedOut ? undefined : { from: location.pathname + location.search }
        }
      />
    );
  }
  return <Outlet />;
}

// Admins run the platform and do not buy or sell.
export function RequireNonAdmin() {
  const { user } = useAuth();
  if (user?.role === 'admin') return <Navigate to="/admin" replace />;
  return <Outlet />;
}

export function RequireAdmin() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return <Outlet />;
}
