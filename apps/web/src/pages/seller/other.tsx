import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Download, FileDown, Upload, Wallet } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ErrorMessage, Pager, Loading, PageHeader } from '@/components/common';
import {
  currentPeriod,
  type Period,
  PeriodPicker,
  periodQuery,
  SeriesChart,
  ShareChart,
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
import { OrderDetail, OrderTable } from '@/pages/buyer';
import { api, download } from '@/lib/api';
import { dateTime, money, PAYOUT_STATUS } from '@/lib/format';
import { useCursorPage } from '@/lib/queries';
import type { Order, Page, Payout } from '@/lib/types';
import { Field } from '@/pages/account';

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
      backTo="/seller/orders"
      viewer="seller"
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
            { label: 'Chuẩn bị hàng', path: 'ship', dialog: 'prepare' },
            { label: 'Hủy đơn', path: 'cancel', variant: 'outline' },
          ];
        }
        return [];
      }}
    />
  );
}

interface WalletLine {
  id: string;
  amount: number;
  refType: string;
  refId: string;
  createdAt: string;
  breakdown: {
    itemsTotal: number;
    sellerDiscount: number;
    freeshipFee: number;
    commission: number;
  } | null;
  payout: Pick<
    Payout,
    | 'bankName'
    | 'accountNumber'
    | 'accountName'
    | 'status'
    | 'createdAt'
    | 'decidedAt'
  > | null;
}

interface WalletPage {
  balance: number;
  // Money from orders still inside the return window, not yet withdrawable.
  held: number;
  items: WalletLine[];
  nextCursor: string | null;
}

const LINE_TYPE = {
  order: 'Tiền đơn hàng',
  return: 'Trả hàng',
  payout: 'Rút tiền',
} as Record<string, string>;

const IN = 'text-emerald-600 dark:text-emerald-400';
const OUT = 'text-red-600 dark:text-red-400';

function LineType({ line }: { line: WalletLine }) {
  return (
    <Badge
      variant="outline"
      className={
        line.amount >= 0
          ? `border-emerald-500/40 bg-emerald-500/10 ${IN}`
          : `border-red-500/40 bg-red-500/10 ${OUT}`
      }
    >
      {LINE_TYPE[line.refType] ?? line.refType}
    </Badge>
  );
}

function SignedAmount({
  amount,
  className,
}: {
  amount: number;
  className?: string;
}) {
  return (
    <span
      className={`font-medium tabular-nums ${amount >= 0 ? IN : OUT} ${className ?? ''}`}
    >
      {amount > 0 && '+'}
      {money(amount)}
    </span>
  );
}

// Every amount between what the buyer paid and what reached the wallet, for one order.
function WalletLineDialog({
  line,
  onClose,
}: {
  line: WalletLine;
  onClose: () => void;
}) {
  const order = useQuery({
    queryKey: ['order', line.refId],
    queryFn: () => api<Order>(`/orders/${line.refId}`),
    enabled: !!line.breakdown,
  });
  const b = line.breakdown;
  const o = order.data;
  const code = (type: string) =>
    o?.vouchers.find((v) => v.type === type)?.code ?? '';
  const revenue = b ? b.itemsTotal - b.sellerDiscount : 0;
  const rate = revenue ? Math.round((b!.commission * 1000) / revenue) / 10 : 0;
  const rows: [string, string, string, number, boolean?][] =
    b && o
      ? [
          ['Tiền hàng', '', 'Người mua', b.itemsTotal],
          [
            'Mã giảm giá của shop',
            code('shop_voucher'),
            'Shop',
            -b.sellerDiscount,
          ],
          ['Doanh thu', '', '', revenue, true],
          [`Phí sàn (${rate}%)`, '', 'Shop', -b.commission],
          ...(b.freeshipFee
            ? [
                ['Phí Freeship', '', 'Shop', -b.freeshipFee] as [
                  string,
                  string,
                  string,
                  number,
                ],
              ]
            : []),
          [
            line.refType === 'return' ? 'Trừ khỏi ví' : 'Vào ví',
            '',
            '',
            line.amount,
            true,
          ],
        ]
      : [];
  const outside: [string, string, string, number, boolean?][] = o
    ? [
        [
          'Mã giảm giá của sàn',
          code('platform_voucher'),
          'Sàn',
          -o.platformDiscount,
        ],
        ['Phí vận chuyển', '', 'Người mua', o.shippingFee],
        [
          'Giảm phí vận chuyển',
          code('shipping_voucher'),
          'Sàn',
          -o.shippingDiscount,
        ],
        ['Người mua thanh toán', '', '', o.total, true],
      ]
    : [];
  const moneyTable = (
    title: string,
    data: [string, string, string, number, boolean?][],
  ) => (
    <Table fit={false}>
      <TableHeader>
        <TableRow>
          <TableHead>{title}</TableHead>
          <TableHead>Mã giảm giá</TableHead>
          <TableHead>Bên chịu</TableHead>
          <TableHead className="text-right">Số tiền</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map(([label, voucher, payer, amount, strong]) => (
          <TableRow key={label} className={strong ? 'font-medium' : ''}>
            <TableCell>{label}</TableCell>
            <TableCell className="font-mono">{voucher}</TableCell>
            <TableCell className="text-muted-foreground">{payer}</TableCell>
            <TableCell className="text-right tabular-nums">
              {money(amount)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3">
            {b
              ? `${LINE_TYPE[line.refType]} ${line.refId.slice(-8).toUpperCase()}`
              : LINE_TYPE.payout}
            <LineType line={line} />
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-end justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {dateTime(line.createdAt)}
          </span>
          <SignedAmount amount={line.amount} className="text-2xl" />
        </div>
        {line.payout && (
          <Table fit={false}>
            <TableHeader>
              <TableRow>
                <TableHead>Thông tin rút tiền</TableHead>
                <TableHead className="text-right">Chi tiết</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(
                [
                  ['Ngân hàng', line.payout.bankName],
                  ['Số tài khoản', line.payout.accountNumber],
                  ['Chủ tài khoản', line.payout.accountName],
                  ['Trạng thái', PAYOUT_STATUS[line.payout.status]],
                  ['Thời gian yêu cầu', dateTime(line.payout.createdAt)],
                  [
                    'Thời gian xử lý',
                    line.payout.decidedAt
                      ? dateTime(line.payout.decidedAt)
                      : '',
                  ],
                  ['Số tiền', money(-line.amount)],
                ] as const
              ).map(([label, value]) => (
                <TableRow key={label}>
                  <TableCell className="text-muted-foreground">
                    {label}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {value}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {b &&
          (order.isPending ? (
            <Loading />
          ) : order.error ? (
            <ErrorMessage error={order.error} />
          ) : (
            <div className="grid gap-6 text-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sản phẩm</TableHead>
                    <TableHead className="text-right">Đơn giá</TableHead>
                    <TableHead className="text-center">Số lượng</TableHead>
                    <TableHead className="text-right">Thành tiền</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {o!.items.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="whitespace-normal">
                        <p>{i.itemName}</p>
                        {i.modelName && (
                          <p className="text-xs text-muted-foreground">
                            {i.modelName}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(i.price)}
                        {i.originalPrice !== null && (
                          <p className="text-xs text-muted-foreground line-through">
                            {money(i.originalPrice)}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {i.quantity}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(i.price * i.quantity)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {moneyTable('Tiền của shop', rows)}
              {moneyTable('Không tính vào ví', outside)}
            </div>
          ))}
      </DialogContent>
    </Dialog>
  );
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
    returnedOrders: number;
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
  const [period, setPeriod] = useState<Period>(currentPeriod);
  const report = useQuery({
    queryKey: ['shop-report', period],
    queryFn: () => api<ShopReport>(`/shops/me/report?${periodQuery(period)}`),
  });
  const t = report.data?.totals;

  return (
    <section>
      <PeriodPicker value={period} onChange={setPeriod} />
      {report.isPending ? (
        <Loading />
      ) : report.error || !t ? (
        <ErrorMessage error={report.error} />
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Doanh thu thực nhận" value={money(t.earnings)} />
            <StatCard label="Đơn hoàn thành" value={count(t.orders)} />
            <StatCard label="Đơn mới" value={count(t.placedOrders)} />
          </div>
          <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
            <SeriesChart
              title="Doanh thu thực nhận"
              data={report.data.series}
              dataKey="earnings"
              kind={period.period}
              format={money}
            />
            <ShareChart
              title="Kết quả đơn hàng"
              format={count}
              parts={[
                { label: 'Hoàn thành', value: t.orders - t.returnedOrders },
                { label: 'Bị hủy', value: t.cancelledOrders },
                { label: 'Trả hàng', value: t.returnedOrders },
              ]}
              extra={['Tiền trả hàng', money(t.returned)]}
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
  const wallet = useCursorPage<WalletPage>(['wallet'], '/shops/me/wallet');
  // The last payout prefills the bank details of the next one.
  const last = useQuery({
    queryKey: ['payouts', 'last'],
    queryFn: () => api<Page<Payout>>('/shops/me/payouts?limit=1'),
  });
  const [selected, setSelected] = useState<WalletLine | null>(null);

  if (wallet.isPending) return <Loading />;
  if (wallet.error) return <ErrorMessage error={wallet.error} />;
  const lines = wallet.data.items;
  const balance = wallet.data.balance;
  const available = Math.max(0, balance - wallet.data.held);

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
            <p className="text-xl font-medium tabular-nums">{money(balance)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Có thể rút</p>
            <p className="text-xl font-medium text-primary tabular-nums">
              {money(available)}
            </p>
          </div>
          <PayoutDialog balance={available} last={last.data?.items[0]} />
        </CardAction>
      </CardHeader>
      <CardContent>
        {!lines.length ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Chưa có giao dịch
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead>Nội dung</TableHead>
                  <TableHead className="text-right">Số tiền</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow
                    key={l.id}
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer"
                    onClick={() => setSelected(l)}
                    onKeyDown={(e) => e.key === 'Enter' && setSelected(l)}
                  >
                    <TableCell>{dateTime(l.createdAt)}</TableCell>
                    <TableCell>
                      <LineType line={l} />
                    </TableCell>
                    <TableCell>
                      {l.breakdown ? (
                        <div className="grid gap-0.5">
                          <span className="font-mono">
                            {l.refId.slice(-8).toUpperCase()}
                          </span>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            Tiền hàng {money(l.breakdown.itemsTotal)}
                            {l.breakdown.sellerDiscount > 0 &&
                              ` − Mã giảm giá của shop ${money(l.breakdown.sellerDiscount)}`}
                            {' − '}Phí sàn {money(l.breakdown.commission)}
                            {l.breakdown.freeshipFee > 0 &&
                              ` − Phí Freeship ${money(l.breakdown.freeshipFee)}`}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">
                          Chuyển về tài khoản ngân hàng
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <SignedAmount amount={l.amount} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pager page={wallet.page} prev={wallet.prev} next={wallet.next} />
          </>
        )}
      </CardContent>
      {selected && (
        <WalletLineDialog line={selected} onClose={() => setSelected(null)} />
      )}
    </Card>
  );
}
