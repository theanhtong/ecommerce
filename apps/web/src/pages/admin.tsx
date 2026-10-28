import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  ChevronLeft,
  LogOut,
  PackageX,
  Store,
  TicketPercent,
  UserRound,
  Undo2,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router';
import { useAuth } from '@/lib/auth-context';
import {
  AddressBlock,
  Empty,
  ErrorMessage,
  Pager,
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
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SELECTED } from '@/components/report';
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
  ['/admin/returns', 'Trả hàng', PackageX],
  ['/admin/refunds', 'Hoàn tiền', Undo2],
  ['/admin/vouchers', 'Khuyến mãi', TicketPercent],
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
              onClick={() => void logout().then(() => navigate('/login'))}
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

interface Moderation {
  id: string;
  status: string;
  reason: string | null;
  createdAt: string;
  actor: { id: string; username: string } | null;
}

type StatusChange<S> = { status: S; reason?: string };

// Banning or rejecting asks for the reason the owner will see; other changes apply at once.
function StatusAction({
  label,
  title,
  needsReason,
  pending,
  onConfirm,
  size,
}: {
  label: string;
  title: string;
  needsReason: boolean;
  pending: boolean;
  onConfirm: (reason?: string) => void;
  size?: 'sm';
}) {
  const [open, setOpen] = useState(false);
  if (!needsReason) {
    return (
      <Button
        size={size}
        variant="outline"
        disabled={pending}
        onClick={() => onConfirm()}
      >
        {label}
      </Button>
    );
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size={size} variant="outline" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const reason = new FormData(e.currentTarget).get('reason');
            onConfirm(String(reason).trim());
            setOpen(false);
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="reason">Lý do</Label>
            <Textarea id="reason" name="reason" required maxLength={500} />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Hủy
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {label}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ModerationHistory({
  items,
  labels,
}: {
  items: Moderation[];
  labels: Record<string, string>;
}) {
  if (!items.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lịch sử xử lý</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Thời gian</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Lý do</TableHead>
              <TableHead>Người xử lý</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="text-muted-foreground">
                  {dateTime(m.createdAt)}
                </TableCell>
                <TableCell>{labels[m.status] ?? m.status}</TableCell>
                <TableCell className="whitespace-pre-line">
                  {m.reason ?? '—'}
                </TableCell>
                <TableCell>{m.actor?.username ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

const USER_STATUS: Record<User['status'], string> = {
  active: 'Hoạt động',
  banned: 'Bị khóa',
};

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
  // The extra tab lists shops asking to join Freeship, whatever their status.
  const [status, setStatus] = useState<ShopStatus | 'freeship'>('active');
  const page = usePaged<AdminShopRow>(
    ['admin-shops', status],
    status === 'freeship'
      ? '/admin/shops?freeship=requested'
      : `/admin/shops?status=${status}`,
  );
  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      api(`/admin/shops/${id}/freeship`, {
        method: 'PATCH',
        body: { approve },
      }),
    onSuccess: (_, { approve }) => {
      toast.success(approve ? 'Đã duyệt Freeship' : 'Đã từ chối');
      void queryClient.invalidateQueries({ queryKey: ['admin-shops'] });
    },
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: StatusChange<ShopStatus> & { id: string }) =>
      api(`/admin/shops/${id}/status`, { method: 'PATCH', body }),
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
        <Button
          size="sm"
          variant="outline"
          className={status === 'freeship' ? SELECTED : undefined}
          onClick={() => setStatus('freeship')}
        >
          Chờ duyệt Freeship
        </Button>
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
                      {status === 'freeship' &&
                        (
                          [
                            [true, 'Duyệt Freeship'],
                            [false, 'Từ chối'],
                          ] as const
                        ).map(([approve, label]) => (
                          <Button
                            key={label}
                            size="sm"
                            variant={approve ? 'default' : 'outline'}
                            disabled={decide.isPending}
                            onClick={() => decide.mutate({ id: s.id, approve })}
                          >
                            {label}
                          </Button>
                        ))}
                      {status !== 'freeship' &&
                        SHOP_ACTIONS[s.status].map(([next, label]) => (
                          <StatusAction
                            key={next}
                            size="sm"
                            label={label}
                            title={`${label} ${s.name}`}
                            needsReason={next !== 'active'}
                            pending={update.isPending}
                            onConfirm={(reason) =>
                              update.mutate({ id: s.id, status: next, reason })
                            }
                          />
                        ))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <Pager page={page.page} prev={page.prev} next={page.next} />
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
    mutationFn: ({
      id,
      ...body
    }: StatusChange<User['status']> & { id: string }) =>
      api(`/admin/users/${id}/status`, { method: 'PATCH', body }),
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
                        <span className="ml-2">
                          <StatusAction
                            size="sm"
                            label={u.status === 'active' ? 'Khóa' : 'Mở khóa'}
                            title={`Khóa ${u.username}`}
                            needsReason={u.status === 'active'}
                            pending={update.isPending}
                            onConfirm={(reason) =>
                              update.mutate({
                                id: u.id,
                                status:
                                  u.status === 'active' ? 'banned' : 'active',
                                reason,
                              })
                            }
                          />
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <Pager page={page.page} prev={page.prev} next={page.next} />
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

type AdminUserDetail = AdminUser & { moderations: Moderation[] };

export function AdminUserPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const user = useQuery({
    queryKey: ['admin-user', id],
    queryFn: () => api<AdminUserDetail>(`/admin/users/${id}`),
  });
  const update = useMutation({
    mutationFn: (body: StatusChange<User['status']>) =>
      api(`/admin/users/${id}/status`, { method: 'PATCH', body }),
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
              <StatusAction
                label={u.status === 'active' ? 'Khóa tài khoản' : 'Mở khóa'}
                title={`Khóa ${u.username}`}
                needsReason={u.status === 'active'}
                pending={update.isPending}
                onConfirm={(reason) =>
                  update.mutate({
                    status: u.status === 'active' ? 'banned' : 'active',
                    reason,
                  })
                }
              />
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
        <ModerationHistory items={u.moderations} labels={USER_STATUS} />
        {u.role !== 'admin' && (
          <AdminOrdersTable filter={`buyerId=${u.id}`} party="buyer" />
        )}
      </div>
    </>
  );
}

type AdminShopDetail = MyShop & {
  moderations: Moderation[];
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
    mutationFn: (body: StatusChange<ShopStatus>) =>
      api(`/admin/shops/${id}/status`, { method: 'PATCH', body }),
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
    <>
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
                <StatusAction
                  key={next}
                  size="sm"
                  label={label}
                  title={`${label} ${s.name}`}
                  needsReason={next !== 'active'}
                  pending={update.isPending}
                  onConfirm={(reason) =>
                    update.mutate({ status: next, reason })
                  }
                />
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
      <ModerationHistory items={s.moderations} labels={SHOP_STATUS} />
    </>
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
        <Pager page={page.page} prev={page.prev} next={page.next} />
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
        <Pager page={page.page} prev={page.prev} next={page.next} />
      </CardContent>
    </Card>
  );
}
