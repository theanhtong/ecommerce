import {
  Link,
  NavLink,
  Outlet,
  ScrollRestoration,
  useNavigate,
  useSearchParams,
} from 'react-router';
import {
  House,
  LogOut,
  ReceiptText,
  Search,
  ShoppingCart,
  Store,
  User,
  type LucideIcon,
} from 'lucide-react';
import { NotificationBell } from '@/components/notifications';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth-context';
import { useCart, useMyShop } from '@/lib/queries';

const nav = (to: string, label: string, Icon: LucideIcon) => (
  <Button asChild variant="ghost" size="sm" key={to}>
    <NavLink to={to}>
      <Icon />
      {label}
    </NavLink>
  </Button>
);

// Counts distinct cart lines, not units.
function CartLink() {
  const count =
    useCart().data?.shops.reduce((n, g) => n + g.items.length, 0) ?? 0;
  return (
    <Button asChild variant="ghost" size="sm">
      <NavLink to="/cart" className="relative">
        <ShoppingCart />
        Giỏ hàng
        {count > 0 && (
          <span className="absolute -top-1 left-5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 text-primary-foreground">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </NavLink>
    </Button>
  );
}

function SearchBox() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  return (
    <form
      key={params.get('q')}
      role="search"
      className="relative w-full max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        const q = new FormData(e.currentTarget).get('q') as string;
        void navigate(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        name="q"
        type="search"
        aria-label="Tìm sản phẩm"
        placeholder="Tìm sản phẩm"
        defaultValue={params.get('q') ?? ''}
        className="pl-8"
      />
    </form>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const shop = useMyShop(user?.role === 'user');

  return (
    <div className="app-bg min-h-svh">
      {/* New pages open at the top; Back returns to where the reader was. */}
      <ScrollRestoration />
      <header className="sticky top-0 z-10 border-t-2 border-b border-t-primary bg-card">
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center gap-2 px-4">
          <Link
            to={user?.role === 'admin' ? '/admin' : '/'}
            className="mr-4 text-base font-medium"
          >
            Marketplace
          </Link>
          <nav className="flex items-center gap-1">
            {user?.role !== 'admin' && nav('/', 'Trang chủ', House)}
            {user?.role === 'user' && <CartLink />}
            {user?.role === 'user' && nav('/orders', 'Đơn mua', ReceiptText)}
            {shop.data?.status === 'active' &&
              nav('/seller', 'Kênh người bán', Store)}
          </nav>
          <div className="flex flex-1 justify-center px-2">
            {user?.role !== 'admin' && <SearchBox />}
          </div>
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
                onClick={() => void logout().then(() => navigate('/login'))}
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
      <main className="mx-auto max-w-screen-2xl px-4 py-5">
        <Outlet />
      </main>
    </div>
  );
}
