import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Store, Users } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import {
  Empty,
  ErrorMessage,
  LoadMore,
  Loading,
  PageHeader,
} from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { dateTime, money, SHOP_STATUS } from '@/lib/format';
import { usePaged } from '@/lib/queries';
import type { Shop, ShopStatus, User } from '@/lib/types';

const TABS = [
  ['/admin/shops', 'Cửa hàng', Store],
  ['/admin/users', 'Người dùng', Users],
  ['/admin/ledger', 'Sổ cái', BookOpen],
] as const;

export function AdminLayout() {
  return (
    <>
      <div className="mb-4 flex gap-2">
        {TABS.map(([to, label, Icon]) => (
          <Button asChild key={to} variant="outline" size="sm">
            <NavLink
              to={to}
              className="aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
            >
              <Icon />
              {label}
            </NavLink>
          </Button>
        ))}
      </div>
      <Outlet />
    </>
  );
}

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
  const [status, setStatus] = useState<ShopStatus>('pending');
  const page = usePaged<Shop>(
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
            variant={status === s ? 'default' : 'outline'}
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
                  <TableHead>Tên cửa hàng</TableHead>
                  <TableHead>Chủ cửa hàng</TableHead>
                  <TableHead>Ngày tạo</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.items.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.owner?.email}</TableCell>
                    <TableCell>{dateTime(s.createdAt)}</TableCell>
                    <TableCell className="space-x-2 text-right">
                      {SHOP_ACTIONS[s.status].map(([next, label]) => (
                        <Button
                          key={next}
                          size="sm"
                          variant={next === 'active' ? 'default' : 'outline'}
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

export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const page = usePaged<User>(['admin-users'], '/admin/users');
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: User['status'] }) =>
      api(`/admin/users/${id}/status`, { method: 'PATCH', body: { status } }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  return (
    <>
      <PageHeader title="Người dùng" />
      {page.isPending ? (
        <Loading />
      ) : page.error ? (
        <ErrorMessage error={page.error} />
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Tên đăng nhập</TableHead>
                  <TableHead>Vai trò</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.items.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>{u.username}</TableCell>
                    <TableCell>
                      {u.role === 'admin' ? 'Quản trị' : 'Người dùng'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          u.status === 'active' ? 'secondary' : 'destructive'
                        }
                      >
                        {u.status === 'active' ? 'Hoạt động' : 'Bị khóa'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {u.role !== 'admin' && (
                        <Button
                          size="sm"
                          variant="outline"
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

const ACCOUNT_LABEL = {
  receivable: 'Phải thu từ vận chuyển/cổng thanh toán',
  commission: 'Doanh thu hoa hồng',
  shipping: 'Phải trả phí vận chuyển',
  wallet: 'Ví cửa hàng',
} as const;

export function AdminLedgerPage() {
  const ledger = useQuery({
    queryKey: ['ledger'],
    queryFn: () =>
      api<{
        items: {
          id: string;
          type: keyof typeof ACCOUNT_LABEL;
          shopId: string | null;
          balance: number;
        }[];
        total: number;
      }>('/admin/ledger/accounts'),
  });

  if (ledger.isPending) return <Loading />;
  if (ledger.error) return <ErrorMessage error={ledger.error} />;

  return (
    <>
      <PageHeader title="Sổ cái" />
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tài khoản</TableHead>
                <TableHead>Cửa hàng</TableHead>
                <TableHead className="text-right">Số dư</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.data.items.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{ACCOUNT_LABEL[a.type]}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {a.shopId ?? ''}
                  </TableCell>
                  <TableCell className="text-right">
                    {money(a.balance)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-semibold">Tổng</TableCell>
                <TableCell />
                <TableCell className="text-right font-semibold">
                  {money(ledger.data.total)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
