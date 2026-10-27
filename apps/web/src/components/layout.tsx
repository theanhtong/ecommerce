import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import {
  House,
  LogOut,
  ReceiptText,
  ShoppingCart,
  User,
  type LucideIcon,
} from 'lucide-react';
import { NotificationBell } from '@/components/notifications';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';

const nav = (to: string, label: string, Icon: LucideIcon) => (
  <Button asChild variant="ghost" size="sm" key={to}>
    <NavLink to={to}>
      <Icon />
      {label}
    </NavLink>
  </Button>
);

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app-bg min-h-svh">
      <header className="sticky top-0 z-10 border-t-2 border-b border-t-primary bg-card">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
          <Link
            to={user?.role === 'admin' ? '/admin' : '/'}
            className="mr-4 text-base font-medium"
          >
            Marketplace
          </Link>
          <nav className="flex flex-1 items-center gap-1">
            {user?.role !== 'admin' && nav('/', 'Trang chủ', House)}
            {user?.role === 'user' && nav('/cart', 'Giỏ hàng', ShoppingCart)}
            {user?.role === 'user' && nav('/orders', 'Đơn mua', ReceiptText)}
          </nav>
          {user?.role === 'admin' ? null : user ? (
            <div className="flex items-center gap-2">
              <NotificationBell />
              <Button asChild variant="ghost" className="h-auto py-1.5">
                <Link to="/account">
                  <User />
                  <span className="grid text-left leading-tight">
                    <span className="font-medium">{user.username}</span>
                    <span className="text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  </span>
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void logout().then(() => navigate('/'))}
              >
                <LogOut />
                Đăng xuất
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button asChild variant="ghost" size="sm">
                <Link to="/login">Đăng nhập</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/register">Đăng ký</Link>
              </Button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-5">
        <Outlet />
      </main>
    </div>
  );
}
