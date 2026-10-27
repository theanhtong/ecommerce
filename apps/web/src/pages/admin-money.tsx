import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import {
  Empty,
  ErrorMessage,
  LoadMore,
  Loading,
  PageHeader,
} from '@/components/common';
import { ConfirmButton } from '@/components/confirm-button';
import { SELECTED } from '@/components/report';
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
import {
  dateTime,
  money,
  REFUND_STATUS,
  RETURN_REASON,
  RETURN_STATUS,
} from '@/lib/format';
import { usePaged } from '@/lib/queries';
import type { Payout, Refund, ReturnReason, ReturnStatus } from '@/lib/types';

function Filter<S extends string>({
  labels,
  value,
  onChange,
}: {
  labels: Record<S, string>;
  value: S;
  onChange: (value: S) => void;
}) {
  return (
    <div className="mb-4 flex gap-2">
      {(Object.keys(labels) as S[]).map((s) => (
        <Button
          key={s}
          size="sm"
          variant="outline"
          className={value === s ? SELECTED : undefined}
          onClick={() => onChange(s)}
        >
          {labels[s]}
        </Button>
      ))}
    </div>
  );
}

export function AdminPayoutsPage() {
  const page = usePaged<Payout & { shop: { id: string; name: string } }>(
    ['admin-payouts'],
    '/admin/payouts',
  );

  return (
    <>
      <PageHeader title="Rút tiền" />
      {page.isPending ? (
        <Loading />
      ) : page.error ? (
        <ErrorMessage error={page.error} />
      ) : !page.items.length ? (
        <Empty>Chưa có lần rút tiền nào</Empty>
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cửa hàng</TableHead>
                  <TableHead>Tài khoản nhận</TableHead>
                  <TableHead className="text-right">Số tiền</TableHead>
                  <TableHead>Thời gian</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="-ml-3"
                      >
                        <Link to={`/admin/shops/${p.shop.id}`}>
                          {p.shop.name}
                        </Link>
                      </Button>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{p.accountName}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.bankName} · {p.accountNumber}
                      </p>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {money(p.amount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {dateTime(p.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <LoadMore
              hasMore={page.hasNextPage}
              loading={page.isFetchingNextPage}
              onClick={() => void page.fetchNextPage()}
            />
          </CardContent>
        </Card>
      )}
    </>
  );
}

export function AdminRefundsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Refund['status']>('pending');
  const page = usePaged<Refund>(
    ['admin-refunds', status],
    `/admin/refunds?status=${status}`,
  );
  const pay = useMutation({
    mutationFn: (id: string) =>
      api(`/admin/refunds/${id}/pay`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Đã cập nhật');
      void queryClient.invalidateQueries({ queryKey: ['admin-refunds'] });
    },
  });

  return (
    <>
      <PageHeader title="Hoàn tiền" />
      <Filter labels={REFUND_STATUS} value={status} onChange={setStatus} />
      {page.isPending ? (
        <Loading />
      ) : page.error ? (
        <ErrorMessage error={page.error} />
      ) : !page.items.length ? (
        <Empty>Không có khoản hoàn tiền</Empty>
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lý do</TableHead>
                  <TableHead>Người nhận</TableHead>
                  <TableHead className="text-right">Số tiền</TableHead>
                  <TableHead>Ngày phát sinh</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {r.order ? (
                        <>
                          <p>{r.order.returned ? 'Trả hàng' : 'Đơn bị hủy'}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {r.order.id.slice(-8).toUpperCase()}
                          </p>
                        </>
                      ) : (
                        <>
                          <p>Chuyển khoản không khớp</p>
                          <p className="text-xs text-muted-foreground">
                            {r.transfer?.content}
                          </p>
                        </>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.order ? (
                        <Button
                          asChild
                          variant="ghost"
                          size="sm"
                          className="-ml-3"
                        >
                          <Link to={`/admin/users/${r.order.buyer.id}`}>
                            {r.order.buyer.username}
                          </Link>
                        </Button>
                      ) : (
                        <span className="font-mono text-xs">
                          {r.transfer?.referenceCode ?? '—'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {money(r.amount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {dateTime(r.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.status === 'pending' ? (
                        <ConfirmButton
                          label="Đã hoàn tiền"
                          title={`Đã hoàn ${money(r.amount)}?`}
                          description={
                            r.order
                              ? r.order.buyer.email
                              : (r.transfer?.content ?? '')
                          }
                          pending={pay.isPending}
                          onConfirm={() => pay.mutate(r.id)}
                        />
                      ) : (
                        <Badge variant="secondary">
                          {REFUND_STATUS[r.status]}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <LoadMore
              hasMore={page.hasNextPage}
              loading={page.isFetchingNextPage}
              onClick={() => void page.fetchNextPage()}
            />
          </CardContent>
        </Card>
      )}
    </>
  );
}

interface ReturnRow {
  id: string;
  orderId: string;
  status: ReturnStatus;
  reason: ReturnReason;
  note: string | null;
  sellerNote: string | null;
  createdAt: string;
  order: {
    id: string;
    total: number;
    shop: { id: string; name: string };
    buyer: { id: string; username: string };
  };
}

export function AdminReturnsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ReturnStatus>('disputed');
  const page = usePaged<ReturnRow>(
    ['admin-returns', status],
    `/admin/returns?status=${status}`,
  );
  const decide = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'accept' | 'reject' }) =>
      api(`/admin/returns/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Đã cập nhật');
      void queryClient.invalidateQueries({ queryKey: ['admin-returns'] });
    },
  });

  return (
    <>
      <PageHeader title="Trả hàng" />
      <Filter labels={RETURN_STATUS} value={status} onChange={setStatus} />
      {page.isPending ? (
        <Loading />
      ) : page.error ? (
        <ErrorMessage error={page.error} />
      ) : !page.items.length ? (
        <Empty>Không có yêu cầu</Empty>
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Đơn hàng</TableHead>
                  <TableHead>Người mua</TableHead>
                  <TableHead>Lý do</TableHead>
                  <TableHead>Người bán</TableHead>
                  <TableHead className="text-right">Số tiền</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <p className="font-mono text-xs">
                        {r.orderId.slice(-8).toUpperCase()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {dateTime(r.createdAt)}
                      </p>
                    </TableCell>
                    <TableCell>{r.order.buyer.username}</TableCell>
                    <TableCell className="max-w-64 whitespace-normal">
                      <p>{RETURN_REASON[r.reason]}</p>
                      {r.note && (
                        <p className="text-xs text-muted-foreground">
                          {r.note}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="max-w-64 whitespace-normal">
                      <p>{r.order.shop.name}</p>
                      {r.sellerNote && (
                        <p className="text-xs text-muted-foreground">
                          {r.sellerNote}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(r.order.total)}
                    </TableCell>
                    <TableCell className="space-x-2 text-right">
                      {r.status === 'disputed' ? (
                        <>
                          <ConfirmButton
                            label="Chấp nhận"
                            title="Chấp nhận trả hàng?"
                            description={`Hoàn ${money(r.order.total)} cho ${r.order.buyer.username}`}
                            pending={decide.isPending}
                            onConfirm={() =>
                              decide.mutate({ id: r.id, action: 'accept' })
                            }
                          />
                          <ConfirmButton
                            label="Từ chối"
                            variant="outline"
                            title="Từ chối trả hàng?"
                            description={r.order.shop.name}
                            pending={decide.isPending}
                            onConfirm={() =>
                              decide.mutate({ id: r.id, action: 'reject' })
                            }
                          />
                        </>
                      ) : (
                        <Badge variant="secondary">
                          {RETURN_STATUS[r.status]}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <LoadMore
              hasMore={page.hasNextPage}
              loading={page.isFetchingNextPage}
              onClick={() => void page.fetchNextPage()}
            />
          </CardContent>
        </Card>
      )}
    </>
  );
}
