import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  CircleX,
  Download,
  FileDown,
  PackageX,
  Percent,
  ShoppingBag,
  TicketPercent,
  Upload,
  Wallet,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import {
  ErrorMessage,
  LoadMore,
  Loading,
  PageHeader,
} from '@/components/common';
import {
  cancelRate,
  IconStat,
  RangePicker,
  type Range,
  SELECTED,
  SeriesChart,
  StatCard,
} from '@/components/report';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { OrderDetail, OrderTable, SHIPMENT_STEP } from '@/pages/buyer';
import { api, download } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import { usePaged } from '@/lib/queries';
import type { Payout } from '@/lib/types';
import { Field } from '@/pages/account';
import { useInfiniteQuery } from '@tanstack/react-query';

interface ImportResult {
  created: number;
  failed: number;
  results: {
    parentSku: string;
    rows: number[];
    status: 'created' | 'failed';
    error?: string;
  }[];
}

export function ImportCsv() {
  const queryClient = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const upload = useMutation({
    mutationFn: (picked: File) => {
      const form = new FormData();
      form.append('file', picked);
      return api<ImportResult>('/items/imports', { method: 'POST', form });
    },
    onSuccess: () => {
      setOpen(true);
      void queryClient.invalidateQueries({ queryKey: ['my-items'] });
    },
  });
  const save = useMutation({
    mutationFn: async ({ path, name }: { path: string; name: string }) => {
      const url = URL.createObjectURL(await download(path));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  return (
    <>
      <Button
        variant="outline"
        disabled={save.isPending}
        onClick={() =>
          save.mutate({
            path: '/items/imports/template',
            name: 'mau-san-pham.csv',
          })
        }
      >
        <FileDown />
        File mẫu
      </Button>
      <Button
        variant="outline"
        disabled={save.isPending}
        onClick={() =>
          save.mutate({ path: '/items/imports/export', name: 'san-pham.csv' })
        }
      >
        <Download />
        Tải
      </Button>
      <input
        ref={file}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(e) => {
          const picked = e.target.files?.[0];
          e.target.value = '';
          if (picked) upload.mutate(picked);
        }}
      />
      <Button
        variant="outline"
        disabled={upload.isPending}
        onClick={() => file.current?.click()}
      >
        <Upload />
        {upload.isPending ? 'Đang nhập…' : 'Nhập'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {upload.data?.created ?? 0} thành công ·{' '}
              {upload.data?.failed ?? 0} lỗi
            </DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dòng</TableHead>
                <TableHead>Mã sản phẩm</TableHead>
                <TableHead>Kết quả</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {upload.data?.results.map((r) => (
                <TableRow key={r.rows.join()}>
                  <TableCell>{r.rows.join(', ')}</TableCell>
                  <TableCell>{r.parentSku}</TableCell>
                  <TableCell>
                    {r.status === 'created' ? (
                      <Badge>Đã tạo</Badge>
                    ) : (
                      <span className="text-destructive">{r.error}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <DialogFooter>
            <DialogClose asChild>
              <Button>Đóng</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SellerOrdersPage() {
  return (
    <>
      <PageHeader title="Đơn hàng" />
      <OrderTable party="seller" />
    </>
  );
}

export function SellerOrderPage() {
  return (
    <OrderDetail
      backTo="/account/seller/orders"
      actions={(o) => {
        if (o.returnRequest?.status === 'requested') {
          return [
            { label: 'Đồng ý trả hàng', path: 'return/accept' },
            {
              label: 'Từ chối',
              path: 'return/reject',
              variant: 'outline' as const,
              dialog: 'reject' as const,
            },
          ];
        }
        if (o.status === 'to_ship' && !o.shipment) {
          return [
            { label: 'Chuẩn bị hàng', path: 'ship' },
            { label: 'Hủy đơn', path: 'cancel', variant: 'outline' },
          ];
        }
        const step = o.shipment && SHIPMENT_STEP[o.shipment.status];
        return step
          ? [
              {
                label: step.label,
                path: 'shipment',
                body: { status: step.status },
              },
            ]
          : [];
      }}
    />
  );
}

interface WalletPage {
  balance: number;
  items: {
    id: string;
    amount: number;
    refType: string;
    refId: string;
    createdAt: string;
  }[];
  nextCursor: string | null;
}

interface ShopReport {
  totals: {
    earnings: number;
    itemsTotal: number;
    commission: number;
    sellerDiscount: number;
    returned: number;
    orders: number;
    averageOrder: number;
    placedOrders: number;
    cancelledOrders: number;
    balance: number;
  };
  series: {
    period: string;
    orders: number;
    earnings: number;
    itemsTotal: number;
  }[];
}

const count = (n: number) => String(n);

export function ShopReportSection() {
  const [range, setRange] = useState<Range>('30d');
  const report = useQuery({
    queryKey: ['shop-report', range],
    queryFn: () => api<ShopReport>(`/shops/me/report?range=${range}`),
  });
  const t = report.data?.totals;

  return (
    <section>
      <RangePicker value={range} onChange={setRange} />
      {report.isPending ? (
        <Loading />
      ) : report.error || !t ? (
        <ErrorMessage error={report.error} />
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Doanh thu thực nhận" value={money(t.earnings)} />
            <StatCard label="Tiền hàng" value={money(t.itemsTotal)} />
            <StatCard label="Đơn hoàn thành" value={count(t.orders)} />
            <StatCard
              label="Giá trị đơn trung bình"
              value={money(t.averageOrder)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <IconStat
              icon={TicketPercent}
              label="Giảm giá của shop"
              value={money(t.sellerDiscount)}
            />
            <IconStat
              icon={Percent}
              label="Phí sàn"
              value={money(t.commission)}
            />
            <IconStat
              icon={ShoppingBag}
              label="Đơn mới"
              value={count(t.placedOrders)}
            />
            <IconStat
              icon={CircleX}
              label="Đơn bị hủy"
              value={count(t.cancelledOrders)}
              note={cancelRate(t.cancelledOrders, t.orders)}
            />
            <IconStat
              icon={PackageX}
              label="Tiền trả hàng"
              value={money(t.returned)}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <SeriesChart
              title="Doanh thu thực nhận"
              data={report.data.series}
              dataKey="earnings"
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
        </div>
      )}
    </section>
  );
}

function PayoutDialog({ balance, last }: { balance: number; last?: Payout }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const request = useMutation({
    mutationFn: (body: object) =>
      api<Payout>('/shops/me/payouts', { method: 'POST', body }),
    onSuccess: () => {
      toast.success('Đã gửi yêu cầu rút tiền');
      setOpen(false);
      for (const key of ['wallet', 'payouts', 'shop-report']) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        request.reset();
      }}
    >
      <Button size="sm" disabled={balance <= 0} onClick={() => setOpen(true)}>
        <Banknote />
        Rút tiền
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rút tiền</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget));
            request.mutate({ ...f, amount: Number(f.amount) });
          }}
        >
          <Field
            label="Số tiền"
            name="amount"
            type="number"
            min={1}
            max={balance}
            defaultValue={balance}
            required
          />
          <Field
            label="Ngân hàng"
            name="bankName"
            defaultValue={last?.bankName}
            required
          />
          <Field
            label="Số tài khoản"
            name="accountNumber"
            inputMode="numeric"
            defaultValue={last?.accountNumber}
            required
          />
          <Field
            label="Chủ tài khoản"
            name="accountName"
            defaultValue={last?.accountName}
            required
          />
          {request.error && <ErrorMessage error={request.error} />}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Hủy
              </Button>
            </DialogClose>
            <Button type="submit" disabled={request.isPending}>
              Gửi yêu cầu
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ShopWallet() {
  const wallet = useInfiniteQuery({
    queryKey: ['wallet'],
    queryFn: ({ pageParam }) =>
      api<WalletPage>(
        pageParam ? `/shops/me/wallet?cursor=${pageParam}` : '/shops/me/wallet',
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const payouts = usePaged<Payout>(['payouts'], '/shops/me/payouts');
  const [tab, setTab] = useState<'lines' | 'payouts'>('lines');

  if (wallet.isPending || payouts.isPending) return <Loading />;
  if (wallet.error) return <ErrorMessage error={wallet.error} />;
  const lines = wallet.data.pages.flatMap((p) => p.items);
  const balance = wallet.data.pages[0].balance;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="size-4 text-muted-foreground" />
          Ví
        </CardTitle>
        <CardAction className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Số dư</p>
            <p className="text-xl font-medium text-primary tabular-nums">
              {money(balance)}
            </p>
          </div>
          <PayoutDialog balance={balance} last={payouts.items[0]} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex gap-2">
          {(
            [
              ['lines', 'Giao dịch'],
              ['payouts', 'Lịch sử rút tiền'],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant="outline"
              className={tab === value ? SELECTED : undefined}
              onClick={() => setTab(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        {tab === 'lines' ? (
          !lines.length ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Chưa có giao dịch
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Thời gian</TableHead>
                    <TableHead>Nội dung</TableHead>
                    <TableHead className="text-right">Số tiền</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>{dateTime(l.createdAt)}</TableCell>
                      <TableCell>
                        {l.refType === 'order' ? (
                          <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            className="-ml-3"
                          >
                            <Link to={`/account/seller/orders/${l.refId}`}>
                              Đơn {l.refId.slice(-8).toUpperCase()}
                            </Link>
                          </Button>
                        ) : (
                          'Rút tiền'
                        )}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${l.amount < 0 ? 'text-muted-foreground' : ''}`}
                      >
                        {l.amount > 0 && '+'}
                        {money(l.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <LoadMore
                hasMore={wallet.hasNextPage}
                loading={wallet.isFetchingNextPage}
                onClick={() => void wallet.fetchNextPage()}
              />
            </>
          )
        ) : !payouts.items.length ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Chưa có yêu cầu rút tiền
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Tài khoản nhận</TableHead>
                  <TableHead className="text-right">Số tiền</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{dateTime(p.createdAt)}</TableCell>
                    <TableCell>
                      {p.bankName} · {p.accountNumber}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(p.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <LoadMore
              hasMore={payouts.hasNextPage}
              loading={payouts.isFetchingNextPage}
              onClick={() => void payouts.fetchNextPage()}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
