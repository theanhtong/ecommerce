import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Banknote,
  FileDown,
  Search,
  Store,
  TicketPercent,
  Truck,
  UserPlus,
} from 'lucide-react';
import { Fragment, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  Empty,
  ErrorMessage,
  Loading,
  PageHeader,
  Pager,
} from '@/components/common';
import {
  Filter,
  IconStat,
  currentPeriod,
  type Period,
  type PeriodKind,
  PeriodPicker,
  periodQuery,
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
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, download } from '@/lib/api';
import { dateTime, money, SHOP_STATUS } from '@/lib/format';
import type { ShopStatus } from '@/lib/types';
import { useCursorPage } from '@/lib/queries';
import { cn } from '@/lib/utils';

type AccountType =
  | 'receivable'
  | 'commission'
  | 'shipping'
  | 'wallet'
  | 'bank'
  | 'prepaid'
  | 'refund_due'
  | 'payout_due'
  | 'promotion'
  | 'service_fee';

const ACCOUNT: Record<AccountType, string> = {
  bank: 'Ngân hàng',
  receivable: 'COD phải thu',
  prepaid: 'Người mua trả trước',
  wallet: 'Ví cửa hàng',
  shipping: 'Vận chuyển',
  refund_due: 'Phải hoàn',
  payout_due: 'Phải trả cửa hàng',
  commission: 'Phí sàn',
  service_fee: 'Phí dịch vụ',
  promotion: 'Khuyến mãi',
};

const ENTRY_TYPE = {
  all: 'Tất cả',
  cod: 'Nộp COD',
  order: 'Đơn hoàn thành',
  return: 'Trả hàng',
  refund: 'Hoàn tiền',
  payment: 'Thanh toán',
  payout: 'Rút tiền',
  transfer: 'Chuyển khoản lạ',
} as const;

const TABS = {
  overview: 'Tổng quan',
  shops: 'Theo cửa hàng',
  entries: 'Bút toán',
} as const;

const count = (n: number) => String(n);
const rate = (part: number, whole: number) =>
  whole ? Math.round((part * 1000) / whole) / 10 : null;
const percent = (value: number | null) => (value === null ? '–' : `${value}%`);

// The view lives in the URL, so a reload, a shared link or Back shows the same thing.
function useParam<T extends string>(
  name: string,
  fallback: T,
  allowed?: readonly T[],
) {
  const [params, setParams] = useSearchParams();
  const raw = params.get(name) as T | null;
  const value = raw && (!allowed || allowed.includes(raw)) ? raw : fallback;
  // Any other filter change sends the list back to its first page.
  const set = (next: T) =>
    setParams((current) => {
      const p = new URLSearchParams(current);
      if (next === fallback) p.delete(name);
      else p.set(name, next);
      if (name !== 'page') p.delete('page');
      return p;
    });
  return [value, set] as const;
}

const keys = <T extends object>(o: T) => Object.keys(o) as (keyof T & string)[];

export function AdminLedgerPage() {
  const [tab, setTab] = useParam('tab', 'overview', keys(TABS));
  return (
    <>
      <PageHeader title="Sổ cái" />
      <Filter labels={TABS} value={tab} onChange={setTab} />
      {tab === 'overview' ? (
        <Overview />
      ) : tab === 'shops' ? (
        <ShopsBoard />
      ) : (
        <Journal />
      )}
    </>
  );
}

interface Report {
  totals: {
    profit: number;
    commission: number;
    serviceFee: number;
    platformVouchers: number;
    shippingSubsidy: number;
    itemsTotal: number;
    shippingFees: number;
    promotions: number;
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
    promotions: number;
    profit: number;
  }[];
}

const KINDS: PeriodKind[] = ['day', 'month', 'year'];

// The period sits in the URL as ?period=month&at=2026-09; no `at` means the current one.
function usePeriodParam() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('period') as PeriodKind | null;
  const kind = raw && KINDS.includes(raw) ? raw : 'month';
  const at = params.get('at');
  const value: Period =
    at && at.length === currentPeriod(kind).at.length
      ? { period: kind, at }
      : currentPeriod(kind);
  const set = (next: Period) =>
    setParams((current) => {
      const p = new URLSearchParams(current);
      p.set('period', next.period);
      if (next.at === currentPeriod(next.period).at) p.delete('at');
      else p.set('at', next.at);
      p.delete('page');
      return p;
    });
  return [value, set] as const;
}

function Overview() {
  const [period, setPeriod] = usePeriodParam();
  const report = useQuery({
    queryKey: ['ledger-report', period],
    queryFn: () => api<Report>(`/admin/ledger/report?${periodQuery(period)}`),
  });
  const t = report.data?.totals;

  return (
    <div className="grid gap-4">
      <BalanceSheet />
      <PeriodPicker value={period} onChange={setPeriod} />
      {report.isPending ? (
        <Loading />
      ) : report.error || !t ? (
        <ErrorMessage error={report.error} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Lợi nhuận" value={money(t.profit)} />
            <StatCard label="Phí sàn thu" value={money(t.commission)} />
            <StatCard label="Tiền hàng" value={money(t.itemsTotal)} />
            <StatCard
              label="Tỉ lệ phí thực thu"
              value={percent(rate(t.commission, t.itemsTotal))}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <IconStat
              icon={Truck}
              label="Phí dịch vụ Freeship"
              value={money(t.serviceFee)}
            />
            <IconStat
              icon={TicketPercent}
              label="Voucher sàn"
              value={money(t.platformVouchers)}
            />
            <IconStat
              icon={Truck}
              label="Hỗ trợ phí vận chuyển"
              value={money(t.shippingSubsidy)}
            />
            <IconStat
              icon={Truck}
              label="Phí vận chuyển thu hộ"
              value={money(t.shippingFees)}
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
          <div className="grid gap-4 lg:grid-cols-2">
            <SeriesChart
              title="Lợi nhuận"
              data={report.data.series}
              dataKey="profit"
              kind={period.period}
              format={money}
            />
            <SeriesChart
              title="Tiền hàng"
              data={report.data.series}
              dataKey="itemsTotal"
              kind={period.period}
              format={money}
            />
          </div>
        </>
      )}
    </div>
  );
}

// Where the money is right now: what the platform holds, what it must pay out, and what is its own.
function BalanceSheet() {
  const balances = useQuery({
    queryKey: ['ledger'],
    queryFn: () =>
      api<{ total: number; byType: Record<AccountType, number> }>(
        '/admin/ledger/accounts',
      ),
  });
  if (balances.isPending) return <Loading />;
  if (balances.error) return <ErrorMessage error={balances.error} />;
  const b = balances.data.byType;
  // `|| 0` drops the -0 a sign flip of an empty account would print.
  const columns: [string, [string, number][]][] = [
    [
      'Tiền sàn đang có',
      [
        ['Tài khoản ngân hàng', b.bank],
        ['COD đơn vị vận chuyển đang giữ', b.receivable],
      ],
    ],
    [
      'Phải trả đi',
      [
        ['Cửa hàng', -b.wallet - b.payout_due || 0],
        ['Đơn vị vận chuyển', -b.shipping || 0],
        ['Hoàn cho người mua', -b.refund_due || 0],
        ['Người mua trả trước', -b.prepaid || 0],
      ],
    ],
    [
      'Còn lại của sàn',
      [
        ['Phí sàn đã thu', -b.commission || 0],
        ['Phí dịch vụ Freeship', -b.service_fee || 0],
        ['Chi phí khuyến mãi', -b.promotion || 0],
      ],
    ],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-3">
          Dòng tiền của sàn
          <Badge
            variant={balances.data.total === 0 ? 'default' : 'destructive'}
          >
            {balances.data.total === 0
              ? 'Đối soát: cân đối'
              : `Đối soát: lệch ${money(balances.data.total)}`}
          </Badge>
        </CardTitle>
        <CardAction>
          <CodRemittanceDialog
            held={b.receivable}
            shippingOwed={-b.shipping || 0}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
        {columns.map(([title, rows], i) => (
          <Fragment key={title}>
            {i > 0 && (
              <span className="hidden self-center text-2xl font-light text-muted-foreground lg:block">
                {i === 1 ? '−' : '='}
              </span>
            )}
            <div
              className={cn(
                'grid content-start gap-3 rounded-lg border p-4',
                i === 2 && 'border-primary/40 bg-primary/5',
              )}
            >
              <div>
                <p className="text-sm text-muted-foreground">{title}</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {money(rows.reduce((n, [, amount]) => n + amount, 0))}
                </p>
              </div>
              <div className="grid gap-1.5 border-t pt-3 text-sm">
                {rows
                  .filter(([, amount]) => amount !== 0)
                  .map(([label, amount]) => (
                    <div key={label} className="flex justify-between gap-4">
                      <span className="text-muted-foreground">{label}</span>
                      <span
                        className={cn(
                          'tabular-nums',
                          amount < 0 && 'text-destructive',
                        )}
                      >
                        {money(amount)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </Fragment>
        ))}
      </CardContent>
    </Card>
  );
}

// Mirrors the API: the carrier keeps the shipping fees owed to it out of the batch.
function CodRemittanceDialog({
  held,
  shippingOwed,
}: {
  held: number;
  shippingOwed: number;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [key, setKey] = useState('');
  const remit = useMutation({
    mutationFn: () =>
      api('/admin/ledger/cod-remittances', {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: { amount: Number(amount) },
      }),
    onSuccess: () => {
      toast.success('Đã ghi nhận tiền COD');
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['ledger'] });
      void queryClient.invalidateQueries({ queryKey: ['ledger-entries'] });
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setAmount(String(held));
          // One key per dialog, so a double submit records the batch once.
          setKey(crypto.randomUUID());
          remit.reset();
        }
      }}
    >
      <Button
        variant="outline"
        size="sm"
        disabled={held <= 0}
        onClick={() => setOpen(true)}
      >
        <Banknote />
        Ghi nhận COD nộp về
      </Button>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Ghi nhận COD nộp về</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            remit.mutate();
          }}
        >
          <p className="text-sm text-muted-foreground">
            Đơn vị vận chuyển đang giữ {money(held)}
          </p>
          <label className="grid gap-2 text-sm">
            <span>Số tiền (₫)</span>
            <Input
              type="number"
              min={1}
              max={held}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          {(() => {
            const gross = Number(amount) || 0;
            const fee = Math.max(0, Math.min(gross, shippingOwed));
            return (
              <dl className="grid gap-1 rounded-md border p-3 text-sm">
                {(
                  [
                    ['Trừ phí vận chuyển đang nợ', -fee],
                    ['Thực nhận vào ngân hàng', gross - fee],
                  ] as const
                ).map(([label, value], i) => (
                  <div
                    key={label}
                    className={`flex justify-between ${i ? 'font-medium' : 'text-muted-foreground'}`}
                  >
                    <dt>{label}</dt>
                    <dd className="tabular-nums">{money(value)}</dd>
                  </div>
                ))}
              </dl>
            );
          })()}
          {remit.error && <ErrorMessage error={remit.error} />}
          <Button type="submit" disabled={remit.isPending}>
            Ghi nhận
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ShopRow {
  id: string;
  name: string;
  status: string;
  itemsTotal: number;
  orders: number;
  returns: number;
  sellerDiscount: number;
  commission: number;
  serviceFee: number;
  freeship: boolean;
  placed: number;
  cancelled: number;
  balance: number;
  lastPayout: string | null;
}

const SORTS = {
  itemsTotal: 'Tiền hàng',
  orders: 'Đơn',
  commission: 'Phí sàn',
  balance: 'Số dư ví',
  cancelRate: 'Tỉ lệ hủy',
  returnRate: 'Tỉ lệ trả hàng',
} as const;

// Assumption: above these rates a shop is worth a look; tune them with real data.
const CANCEL_ALERT = 10;
const RETURN_ALERT = 5;

function ShopsBoard() {
  const [period, setPeriod] = usePeriodParam();
  const [sort, setSort] = useParam('sort', 'itemsTotal', keys(SORTS));
  const [q, setQ] = useParam<string>('q', '');
  const [pageParam, setPage] = useParam<string>('page', '1');
  const page = Math.max(1, Number(pageParam) || 1);
  const [opened, setOpened] = useState<ShopRow | null>(null);
  const board = useQuery({
    queryKey: ['ledger-shops', period, sort, q, page],
    queryFn: () =>
      api<{ items: ShopRow[]; total: number; hasMore: boolean }>(
        `/admin/ledger/shops?${periodQuery(period)}&${new URLSearchParams({ sort, q, page: String(page) })}`,
      ),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="grid gap-4">
      <PeriodPicker value={period} onChange={setPeriod} />
      <Card>
        <CardContent className="grid gap-3">
          <form
            role="search"
            className="relative max-w-sm"
            onSubmit={(e) => {
              e.preventDefault();
              setQ(String(new FormData(e.currentTarget).get('q')).trim());
            }}
          >
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              key={q}
              name="q"
              type="search"
              defaultValue={q}
              aria-label="Tìm cửa hàng"
              placeholder="Tìm cửa hàng"
              className="pl-8"
            />
          </form>
          <Filter labels={SORTS} value={sort} onChange={setSort} />
        </CardContent>
      </Card>
      {board.isPending ? (
        <Loading />
      ) : board.error ? (
        <ErrorMessage error={board.error} />
      ) : (
        <Card
          className={cn(
            'transition-opacity',
            board.isPlaceholderData && 'opacity-50',
          )}
        >
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cửa hàng</TableHead>
                  <TableHead className="text-right">Tiền hàng</TableHead>
                  <TableHead className="text-right">Đơn</TableHead>
                  <TableHead className="text-right">Phí sàn</TableHead>
                  <TableHead className="text-right">Phí Freeship</TableHead>
                  <TableHead className="text-right">Voucher shop</TableHead>
                  <TableHead className="text-right">Tỉ lệ hủy</TableHead>
                  <TableHead className="text-right">Tỉ lệ trả hàng</TableHead>
                  <TableHead className="text-right">Số dư ví</TableHead>
                  <TableHead>Rút tiền gần nhất</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {board.data.items.map((s) => {
                  const cancel = rate(s.cancelled, s.placed);
                  const returned = rate(s.returns, s.orders);
                  return (
                    <TableRow
                      key={s.id}
                      role="button"
                      tabIndex={0}
                      className="cursor-pointer"
                      onClick={() => setOpened(s)}
                      onKeyDown={(e) => e.key === 'Enter' && setOpened(s)}
                    >
                      <TableCell className="font-medium">
                        {s.name}
                        {s.status !== 'active' && (
                          <Badge variant="outline" className="ml-2">
                            {SHOP_STATUS[s.status as ShopStatus]}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(s.itemsTotal)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.orders}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(s.commission)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.freeship || s.serviceFee ? money(s.serviceFee) : '–'}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {money(s.sellerDiscount)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right tabular-nums',
                          (cancel ?? 0) > CANCEL_ALERT &&
                            'font-medium text-destructive',
                        )}
                      >
                        {percent(cancel)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right tabular-nums',
                          (returned ?? 0) > RETURN_ALERT &&
                            'font-medium text-destructive',
                        )}
                      >
                        {percent(returned)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {money(s.balance)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {s.lastPayout ? dateTime(s.lastPayout) : '–'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <p className="mt-3 text-sm text-muted-foreground">
              {board.data.total} cửa hàng
            </p>
          </CardContent>
        </Card>
      )}
      <Pager
        page={page}
        prev={page > 1 ? () => setPage(String(page - 1)) : undefined}
        next={board.data?.hasMore ? () => setPage(String(page + 1)) : undefined}
      />
      {opened && (
        <ShopWalletDialog shop={opened} onClose={() => setOpened(null)} />
      )}
    </div>
  );
}

interface WalletLine {
  id: string;
  amount: number;
  refType: keyof typeof ENTRY_TYPE;
  refId: string;
  createdAt: string;
  payout: {
    bankName: string;
    accountNumber: string;
    accountName: string;
  } | null;
}

function ShopWalletDialog({
  shop,
  onClose,
}: {
  shop: ShopRow;
  onClose: () => void;
}) {
  const wallet = useCursorPage<{
    balance: number;
    held: number;
    items: WalletLine[];
    nextCursor: string | null;
  }>(['ledger-shop-wallet', shop.id], `/admin/ledger/shops/${shop.id}/wallet`);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ví {shop.name}</DialogTitle>
        </DialogHeader>
        {wallet.isPending ? (
          <Loading />
        ) : wallet.error ? (
          <ErrorMessage error={wallet.error} />
        ) : (
          <>
            <p className="flex gap-6 text-sm">
              {(
                [
                  ['Số dư', wallet.data.balance],
                  ['Đang giữ', wallet.data.held],
                ] as const
              ).map(([label, value]) => (
                <span key={label}>
                  {label}{' '}
                  <span className="font-medium tabular-nums">
                    {money(value)}
                  </span>
                </span>
              ))}
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead>Tham chiếu</TableHead>
                  <TableHead className="text-right">Số tiền</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wallet.data.items.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{dateTime(l.createdAt)}</TableCell>
                    <TableCell>{ENTRY_TYPE[l.refType] ?? l.refType}</TableCell>
                    <TableCell>
                      {l.payout ? (
                        <>
                          <p>{l.payout.accountName}</p>
                          <p className="text-xs text-muted-foreground">
                            {l.payout.bankName} · {l.payout.accountNumber}
                          </p>
                        </>
                      ) : (
                        <span className="font-mono">
                          {l.refId.slice(-8).toUpperCase()}
                        </span>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-medium tabular-nums',
                        l.amount >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400',
                      )}
                    >
                      {l.amount > 0 && '+'}
                      {money(l.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pager page={wallet.page} prev={wallet.prev} next={wallet.next} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface Entry {
  id: string;
  refType: keyof typeof ENTRY_TYPE;
  refId: string;
  createdAt: string;
  description: string;
  lines: {
    id: string;
    account: AccountType;
    shop: { id: string; name: string } | null;
    amount: number;
  }[];
}

// First and last day (inclusive) of a calendar period, as the journal filter takes them.
function periodDays({ period, at }: Period) {
  if (period === 'day') return { from: at, to: at };
  if (period === 'year') return { from: `${at}-01-01`, to: `${at}-12-31` };
  const [y, m] = at.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${at}-01`, to: `${at}-${String(last).padStart(2, '0')}` };
}

function Journal() {
  const [period, setPeriod] = usePeriodParam();
  const [type, setType] = useParam('type', 'all', keys(ENTRY_TYPE));
  const filter = new URLSearchParams({
    ...(type !== 'all' && { type }),
    ...periodDays(period),
  }).toString();
  const journal = useCursorPage<{
    items: Entry[];
    nextCursor: string | null;
  }>(['ledger-entries', filter], `/admin/ledger/entries?${filter}`);
  const save = useMutation({
    mutationFn: async () => {
      const url = URL.createObjectURL(
        await download(`/admin/ledger/entries.csv?${filter}`),
      );
      const a = document.createElement('a');
      a.href = url;
      // Named after the period it covers, e.g. so-cai_2026-10.csv or so-cai_2026-10_payout.csv.
      a.download = `so-cai_${period.at}${type === 'all' ? '' : `_${type}`}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PeriodPicker value={period} onChange={setPeriod} />
        <Button
          variant="outline"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          <FileDown />
          Xuất CSV
        </Button>
      </div>
      {save.error && <ErrorMessage error={save.error} />}
      <Filter labels={ENTRY_TYPE} value={type} onChange={setType} />
      {journal.isPending ? (
        <Loading />
      ) : journal.error ? (
        <ErrorMessage error={journal.error} />
      ) : !journal.data.items.length ? (
        <Empty>Không có bút toán trong kỳ này</Empty>
      ) : (
        <Card
          className={cn(
            'transition-opacity',
            journal.isPlaceholderData && 'opacity-50',
          )}
        >
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead>Diễn giải</TableHead>
                  <TableHead>Tài khoản</TableHead>
                  <TableHead className="text-right">Nợ</TableHead>
                  <TableHead className="text-right">Có</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {journal.data.items.flatMap((e) =>
                  e.lines.map((l, i) => (
                    <TableRow
                      key={l.id}
                      className={cn(
                        'align-top',
                        i < e.lines.length - 1 && 'border-b-0',
                      )}
                    >
                      {i === 0 && (
                        <>
                          <TableCell rowSpan={e.lines.length}>
                            {dateTime(e.createdAt)}
                          </TableCell>
                          <TableCell rowSpan={e.lines.length}>
                            <Badge variant="outline">
                              {ENTRY_TYPE[e.refType] ?? e.refType}
                            </Badge>
                          </TableCell>
                          <TableCell
                            rowSpan={e.lines.length}
                            className="max-w-80 whitespace-normal"
                          >
                            {e.description}
                          </TableCell>
                        </>
                      )}
                      <TableCell>
                        {ACCOUNT[l.account]}
                        {l.shop && (
                          <span className="text-muted-foreground">
                            {' '}
                            · {l.shop.name}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.amount > 0 ? money(l.amount) : ''}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.amount < 0 ? money(-l.amount) : ''}
                      </TableCell>
                    </TableRow>
                  )),
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <Pager page={journal.page} prev={journal.prev} next={journal.next} />
    </div>
  );
}
