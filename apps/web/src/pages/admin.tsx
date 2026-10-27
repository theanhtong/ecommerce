import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  BookOpen,
  ChevronLeft,
  CircleX,
  LogOut,
  Store,
  Truck,
  UserPlus,
  UserRound,
  Undo2,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router';
import { useAuth } from '@/lib/auth-context';
import {
  AddressBlock,
  Empty,
  ErrorMessage,
  LoadMore,
  Loading,
  OrderStatusBadge,
  PageHeader,
} from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  cancelRate,
  IconStat,
  periodLabel,
  RangePicker,
  type Range,
  SELECTED,
  SeriesChart,
  StatCard,
} from '@/components/report';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import {
  dateTime,
  money,
  PAYMENT_METHOD,
  priceRange,
  SHOP_STATUS,
} from '@/lib/format';
import { usePaged } from '@/lib/queries';
import type {
  ItemSummary,
  MyShop,
  Order,
  Shop,
  ShopStatus,
  User,
} from '@/lib/types';

const TABS = [
  ['/admin/ledger', 'Sổ cái', BookOpen],
  ['/admin/shops', 'Cửa hàng', Store],
  ['/admin/users', 'Người dùng', Users],
  ['/admin/payouts', 'Rút tiền', Banknote],
  ['/admin/refunds', 'Hoàn tiền', Undo2],
] as const;

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="grid gap-5 md:grid-cols-[13rem_1fr]">
      <nav className="flex flex-wrap gap-2 md:sticky md:top-20 md:h-[calc(100svh-7rem)] md:flex-col md:flex-nowrap">
        {TABS.map(([to, label, Icon]) => (
          <Button
            asChild
            key={to}
            variant="outline"
            className="justify-start aria-[current=page]:border-primary aria-[current=page]:text-primary"
          >
            <NavLink to={to}>
              <Icon />
              {label}
            </NavLink>
          </Button>
        ))}
        {user && (
          <div className="flex gap-2 md:mt-auto md:flex-col md:border-t md:pt-3">
            <Button
              asChild
              variant="ghost"
              className="h-auto justify-start py-1.5 aria-[current=page]:text-primary"
            >
              <NavLink to="/admin/account">
                <UserRound />
                <span className="grid min-w-0 text-left leading-tight">
                  <span className="truncate font-medium">{user.username}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </span>
                </span>
              </NavLink>
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => void logout().then(() => navigate('/'))}
            >
              <LogOut />
              Đăng xuất
            </Button>
          </div>
        )}
      </nav>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}

const shopBadge = (status: ShopStatus) => (
  <Badge
    variant={
      status === 'active'
        ? 'default'
        : status === 'pending'
          ? 'secondary'
          : 'destructive'
    }
  >
    {SHOP_STATUS[status]}
  </Badge>
);

const SHOP_ACTIONS: Record<ShopStatus, [ShopStatus, string][]> = {
  pending: [
    ['active', 'Duyệt'],
    ['rejected', 'Từ chối'],
  ],
  active: [['banned', 'Khóa']],
  rejected: [],
  banned: [['active', 'Mở khóa']],
};

export function AdminShopsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ShopStatus>('active');
  const page = usePaged<AdminShopRow>(
    ['admin-shops', status],
    `/admin/shops?status=${status}`,
  );
  const update = useMutation({
    mutationFn: ({ id, next }: { id: string; next: ShopStatus }) =>
      api(`/admin/shops/${id}/status`, {
        method: 'PATCH',
        body: { status: next },
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['admin-shops'] }),
  });

  return (
    <>
      <PageHeader title="Cửa hàng" />
      <div className="mb-4 flex gap-2">
        {(Object.keys(SHOP_STATUS) as ShopStatus[]).map((s) => (
          <Button
            key={s}
            size="sm"
            variant="outline"
            className={status === s ? SELECTED : undefined}
            onClick={() => setStatus(s)}
          >
            {SHOP_STATUS[s]}
          </Button>
        ))}
      </div>
      {page.isPending ? (
        <Loading />
      ) : page.error ? (
        <ErrorMessage error={page.error} />
      ) : !page.items.length ? (
        <Empty>Không có cửa hàng</Empty>
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cửa hàng</TableHead>
                  <TableHead>Chủ cửa hàng</TableHead>
                  <TableHead>Khu vực</TableHead>
                  <TableHead className="text-right">Sản phẩm</TableHead>
                  <TableHead className="text-right">Đơn hàng</TableHead>
                  <TableHead className="text-right">Số dư ví</TableHead>
                  <TableHead>Ngày tạo</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.items.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>
                      <p>{s.owner.username}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.owner.email}
                      </p>
                    </TableCell>
                    <TableCell>{s.province}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.itemCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.orderCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(s.walletBalance)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {dateTime(s.createdAt)}
                    </TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/admin/shops/${s.id}`}>Chi tiết</Link>
                      </Button>
                      {SHOP_ACTIONS[s.status].map(([next, label]) => (
                        <Button
                          key={next}
                          size="sm"
                          variant="outline"
                          disabled={update.isPending}
                          onClick={() => update.mutate({ id: s.id, next })}
                        >
                          {label}
                        </Button>
                      ))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <LoadMore
        hasMore={page.hasNextPage}
        loading={page.isFetchingNextPage}
        onClick={() => void page.fetchNextPage()}
      />
    </>
  );
}

type AdminUser = User & {
  shop: { id: string; name: string; status: ShopStatus } | null;
  orderCount: number;
};

type AdminShopRow = Shop & {
  owner: { id: string; email: string; username: string };
  province: string;
  itemCount: number;
  orderCount: number;
  walletBalance: number;
};

const USER_FILTERS = [
  ['user', 'Người dùng'],
  ['admin', 'Quản trị'],
] as const;

export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<User['role']>('user');
  const page = usePaged<AdminUser>(
    ['admin-users', role],
    `/admin/users?role=${role}`,
  );
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: User['status'] }) =>
      api(`/admin/users/${id}/status`, { method: 'PATCH', body: { status } }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  return (
    <>
      <PageHeader title="Người dùng" />
      <div className="mb-4 flex flex-wrap gap-2">
        {USER_FILTERS.map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant="outline"
            className={role === value ? SELECTED : undefined}
            onClick={() => setRole(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      {page.isPending ? (
        <Loading />
      ) : page.error ? (
        <ErrorMessage error={page.error} />
      ) : !page.items.length ? (
        <Empty>Không có người dùng</Empty>
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Người dùng</TableHead>
                  <TableHead>Cửa hàng</TableHead>
                  <TableHead className="text-right">Đơn đã mua</TableHead>
                  <TableHead>Tham gia</TableHead>
                  <TableHead>Tài khoản</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.items.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <p className="font-medium">{u.username}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </TableCell>
                    <TableCell>
                      {u.shop ? (
                        <span className="flex items-center gap-2">
                          {u.shop.name}
                          {u.shop.status !== 'active' &&
                            shopBadge(u.shop.status)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {u.role === 'admin' ? '—' : u.orderCount}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {dateTime(u.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          u.status === 'active' ? 'default' : 'destructive'
                        }
                      >
                        {u.status === 'active' ? 'Hoạt động' : 'Bị khóa'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/admin/users/${u.id}`}>Chi tiết</Link>
                      </Button>
                      {u.role !== 'admin' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="ml-2"
                          disabled={update.isPending}
                          onClick={() =>
                            update.mutate({
                              id: u.id,
                              status:
                                u.status === 'active' ? 'banned' : 'active',
                            })
                          }
                        >
                          {u.status === 'active' ? 'Khóa' : 'Mở khóa'}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <LoadMore
        hasMore={page.hasNextPage}
        loading={page.isFetchingNextPage}
        onClick={() => void page.fetchNextPage()}
      />
    </>
  );
}

type Report = {
  totals: {
    profit: number;
    itemsTotal: number;
    shippingFees: number;
    orders: number;
    averageOrder: number;
    cancelledOrders: number;
    newUsers: number;
    newShops: number;
  };
  series: {
    period: string;
    orders: number;
    itemsTotal: number;
    shippingFees: number;
    profit: number;
  }[];
};

export function AdminLedgerPage() {
  const [range, setRange] = useState<Range>('30d');
  const report = useQuery({
    queryKey: ['ledger-report', range],
    queryFn: () => api<Report>(`/admin/ledger/report?range=${range}`),
  });
  const balances = useQuery({
    queryKey: ['ledger'],
    queryFn: () => api<{ total: number }>('/admin/ledger/accounts'),
  });
  const count = (n: number) => String(n);
  const t = report.data?.totals;

  return (
    <>
      <PageHeader
        title="Sổ cái"
        actions={
          balances.data && (
            <Badge
              variant={balances.data.total === 0 ? 'default' : 'destructive'}
            >
              {balances.data.total === 0
                ? 'Cân đối'
                : `Lệch ${money(balances.data.total)}`}
            </Badge>
          )
        }
      />
      <RangePicker value={range} onChange={setRange} />
      {report.isPending ? (
        <Loading />
      ) : report.error || !t ? (
        <ErrorMessage error={report.error} />
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Lợi nhuận" value={money(t.profit)} />
            <StatCard label="Tiền hàng" value={money(t.itemsTotal)} />
            <StatCard label="Đơn hoàn thành" value={count(t.orders)} />
            <StatCard
              label="Giá trị đơn trung bình"
              value={money(t.averageOrder)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <IconStat
              icon={Truck}
              label="Phí vận chuyển thu hộ"
              value={money(t.shippingFees)}
            />
            <IconStat
              icon={CircleX}
              label="Đơn bị hủy"
              value={count(t.cancelledOrders)}
              note={cancelRate(t.cancelledOrders, t.orders)}
            />
            <IconStat
              icon={UserPlus}
              label="Người dùng mới"
              value={count(t.newUsers)}
            />
            <IconStat
              icon={Store}
              label="Cửa hàng mới"
              value={count(t.newShops)}
            />
          </div>
          <SeriesChart
            title="Lợi nhuận"
            data={report.data.series}
            dataKey="profit"
            range={range}
            format={money}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <SeriesChart
              title="Tiền hàng"
              data={report.data.series}
              dataKey="itemsTotal"
              range={range}
              format={money}
            />
            <SeriesChart
              title="Đơn hoàn thành"
              data={report.data.series}
              dataKey="orders"
              range={range}
              format={count}
            />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Chi tiết</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Thời gian</TableHead>
                    <TableHead className="text-right">Đơn hoàn thành</TableHead>
                    <TableHead className="text-right">Tiền hàng</TableHead>
                    <TableHead className="text-right">Phí vận chuyển</TableHead>
                    <TableHead className="text-right">Lợi nhuận</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...report.data.series]
                    .reverse()
                    .filter((p) => p.orders > 0)
                    .map((p) => (
                      <TableRow key={p.period}>
                        <TableCell>
                          {periodLabel(range, p.period, true)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.orders}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(p.itemsTotal)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground tabular-nums">
                          {money(p.shippingFees)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {money(p.profit)}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

function BackTo({ to }: { to: string }) {
  return (
    <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
      <Link to={to}>
        <ChevronLeft />
        Quay lại
      </Link>
    </Button>
  );
}

type AdminUserDetail = AdminUser;

export function AdminUserPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const user = useQuery({
    queryKey: ['admin-user', id],
    queryFn: () => api<AdminUserDetail>(`/admin/users/${id}`),
  });
  const update = useMutation({
    mutationFn: (status: User['status']) =>
      api(`/admin/users/${id}/status`, { method: 'PATCH', body: { status } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-user', id] });
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  if (user.isPending) return <Loading />;
  if (user.error) return <ErrorMessage error={user.error} />;
  const u = user.data;

  return (
    <>
      <BackTo to="/admin/users" />
      <PageHeader
        title={u.username}
        actions={
          <>
            {u.role === 'admin' && <Badge variant="secondary">Quản trị</Badge>}
            <Badge variant={u.status === 'active' ? 'default' : 'destructive'}>
              {u.status === 'active' ? 'Hoạt động' : 'Bị khóa'}
            </Badge>
            {u.role !== 'admin' && (
              <Button
                variant="outline"
                disabled={update.isPending}
                onClick={() =>
                  update.mutate(u.status === 'active' ? 'banned' : 'active')
                }
              >
                {u.status === 'active' ? 'Khóa tài khoản' : 'Mở khóa'}
              </Button>
            )}
          </>
        }
      />
      <Card size="sm" className="mb-4">
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            {(
              [
                ['Email', u.email],
                ['Đơn đã mua', u.role === 'admin' ? '—' : u.orderCount],
                ['Tham gia', dateTime(u.createdAt)],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="mt-1 font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <div className="grid gap-4">
        {u.role !== 'admin' && (
          <AdminOrdersTable filter={`buyerId=${u.id}`} party="buyer" />
        )}
      </div>
    </>
  );
}

type AdminShopDetail = MyShop & {
  owner: { id: string; email: string; username: string };
  itemCount: number;
  orderCount: number;
  walletBalance: number;
};

function ShopDetail({ id, showOwner }: { id: string; showOwner?: boolean }) {
  const queryClient = useQueryClient();
  const shop = useQuery({
    queryKey: ['admin-shop', id],
    queryFn: () => api<AdminShopDetail>(`/admin/shops/${id}`),
  });
  const update = useMutation({
    mutationFn: (next: ShopStatus) =>
      api(`/admin/shops/${id}/status`, {
        method: 'PATCH',
        body: { status: next },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-shop', id] });
      void queryClient.invalidateQueries({ queryKey: ['admin-shops'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-user'] });
    },
  });

  if (shop.isPending) return <Loading />;
  if (shop.error) return <ErrorMessage error={shop.error} />;
  const s = shop.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Store className="size-4 text-muted-foreground" />
          {s.name}
          {shopBadge(s.status)}
        </CardTitle>
        {showOwner && (
          <CardDescription className="flex items-center gap-2">
            <UserRound className="size-3.5" />
            {s.owner.username} · {s.owner.email}
          </CardDescription>
        )}
        {SHOP_ACTIONS[s.status].length > 0 && (
          <CardAction className="flex gap-2">
            {SHOP_ACTIONS[s.status].map(([next, label]) => (
              <Button
                key={next}
                size="sm"
                variant="outline"
                disabled={update.isPending}
                onClick={() => update.mutate(next)}
              >
                {label}
              </Button>
            ))}
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <div className="grid content-start gap-4 text-sm">
          <dl className="grid grid-cols-3 gap-4">
            {(
              [
                ['Sản phẩm', s.itemCount],
                ['Đơn hàng', s.orderCount],
                ['Số dư ví', money(s.walletBalance)],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-lg font-medium tabular-nums">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          {s.description && (
            <p className="whitespace-pre-line">{s.description}</p>
          )}
          <p className="text-muted-foreground">
            Mở ngày {dateTime(s.createdAt)}
          </p>
        </div>
        <div className="grid content-start gap-3 md:border-l md:pl-6">
          <h3 className="text-sm font-medium text-muted-foreground">
            Địa chỉ lấy hàng
          </h3>
          <AddressBlock
            name={s.contactName}
            phone={s.phone}
            street={s.street}
            location={s}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export function AdminShopPage() {
  const { id } = useParams();
  return (
    <>
      <BackTo to="/admin/shops" />
      <div className="grid gap-4">
        <ShopDetail id={id!} showOwner />
        <AdminItemsTable shopId={id!} />
        <AdminOrdersTable filter={`shopId=${id}`} party="shop" />
      </div>
    </>
  );
}

type AdminOrder = Order & {
  buyer: { id: string; email: string; username: string };
};

function AdminOrdersTable({
  filter,
  party,
}: {
  filter: string;
  party: 'buyer' | 'shop';
}) {
  const page = usePaged<AdminOrder>(
    ['admin-orders', filter],
    `/admin/orders?${filter}`,
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{party === 'buyer' ? 'Đơn đã mua' : 'Đơn hàng'}</CardTitle>
      </CardHeader>
      <CardContent>
        {page.isPending ? (
          <Loading />
        ) : page.error ? (
          <ErrorMessage error={page.error} />
        ) : !page.items.length ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Chưa có đơn hàng
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã đơn</TableHead>
                <TableHead>
                  {party === 'buyer' ? 'Cửa hàng' : 'Người mua'}
                </TableHead>
                <TableHead>Sản phẩm</TableHead>
                <TableHead className="text-right">Tổng tiền</TableHead>
                <TableHead>Thanh toán</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Ngày đặt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">
                    {o.id.slice(-8).toUpperCase()}
                  </TableCell>
                  <TableCell>
                    {party === 'buyer' ? (
                      o.shop.name
                    ) : (
                      <>
                        <p>{o.buyer.username}</p>
                        <p className="text-xs text-muted-foreground">
                          {o.buyer.email}
                        </p>
                      </>
                    )}
                  </TableCell>
                  <TableCell className="max-w-64">
                    <p className="truncate">
                      {o.items
                        .map((i) => `${i.itemName} × ${i.quantity}`)
                        .join(', ')}
                    </p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(o.total)}
                  </TableCell>
                  <TableCell>{PAYMENT_METHOD[o.paymentMethod]}</TableCell>
                  <TableCell>
                    <OrderStatusBadge status={o.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {dateTime(o.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <LoadMore
          hasMore={page.hasNextPage}
          loading={page.isFetchingNextPage}
          onClick={() => void page.fetchNextPage()}
        />
      </CardContent>
    </Card>
  );
}

const ITEM_STATUS = {
  active: 'Đang bán',
  hidden: 'Đã ẩn',
  banned: 'Bị khóa',
} as const;

function AdminItemsTable({ shopId }: { shopId: string }) {
  const queryClient = useQueryClient();
  const page = usePaged<ItemSummary>(
    ['admin-items', shopId],
    `/admin/items?shopId=${shopId}`,
  );
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'banned' }) =>
      api(`/admin/items/${id}/status`, { method: 'PATCH', body: { status } }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['admin-items', shopId] }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sản phẩm</CardTitle>
      </CardHeader>
      <CardContent>
        {page.isPending ? (
          <Loading />
        ) : page.error ? (
          <ErrorMessage error={page.error} />
        ) : !page.items.length ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Chưa có sản phẩm
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sản phẩm</TableHead>
                <TableHead className="text-right">Giá</TableHead>
                <TableHead className="text-right">Có thể bán</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Ngày tạo</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {priceRange(i.priceMin, i.priceMax)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {i.stock}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        i.status === 'active'
                          ? 'default'
                          : i.status === 'hidden'
                            ? 'secondary'
                            : 'destructive'
                      }
                    >
                      {ITEM_STATUS[i.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {dateTime(i.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={update.isPending}
                      onClick={() =>
                        update.mutate({
                          id: i.id,
                          status: i.status === 'banned' ? 'active' : 'banned',
                        })
                      }
                    >
                      {i.status === 'banned' ? 'Mở khóa' : 'Khóa'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <LoadMore
          hasMore={page.hasNextPage}
          loading={page.isFetchingNextPage}
          onClick={() => void page.fetchNextPage()}
        />
      </CardContent>
    </Card>
  );
}
