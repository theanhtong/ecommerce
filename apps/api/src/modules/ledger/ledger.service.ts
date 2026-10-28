import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { LedgerAccountType, PaymentMethod, Prisma } from '@ecommerce/db';
import {
  cursorArgs,
  toPage,
  type CursorQuery,
} from '../../common/pagination.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { toCsv } from '../catalog/import/csv.js';

interface Posting {
  idempotencyKey: string;
  refType: string;
  refId: string;
  lines: { account: string; amount: number }[];
}

// Assumption: one flat commission rate on item value.
export function commissionRateBps() {
  const value = Number(process.env.COMMISSION_RATE_BPS);
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new Error('COMMISSION_RATE_BPS must be an integer from 0 to 10000');
  }
  return value;
}

// shortcut: no holding period or payouts; add them with those features.
export const REPORT_PERIODS = ['day', 'month', 'year'] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];
// `at` is any date inside the period (YYYY, YYYY-MM or YYYY-MM-DD); without it, the current one.
export interface ReportWindow {
  period: ReportPeriod;
  at?: string;
}

const BUCKETS: Record<ReportPeriod, { unit: string; label: string }> = {
  day: { unit: 'hour', label: 'HH24' },
  month: { unit: 'day', label: 'YYYY-MM-DD' },
  year: { unit: 'month', label: 'YYYY-MM' },
};

// One calendar day, month or year in Vietnam time, split into hours, days or months.
function reportWindow({ period, at }: ReportWindow) {
  const { unit, label } = BUCKETS[period];
  const tz = Prisma.sql`'Asia/Ho_Chi_Minh'`;
  // "2026" and "2026-09" pad to the first day: "2026-01-01", "2026-09-01".
  const anchor = at
    ? Prisma.sql`${`${at}-01-01`.slice(0, 10)}::timestamp`
    : Prisma.sql`now() AT TIME ZONE ${tz}`;
  const start = Prisma.sql`date_trunc(${period}, ${anchor})`;
  const until = Prisma.sql`${start} + ('1 ' || ${period})::interval`;
  const local = (column: Prisma.Sql) =>
    Prisma.sql`${column} AT TIME ZONE ${tz}`;
  return {
    unit,
    label,
    start,
    end: Prisma.sql`${until} - ('1 ' || ${unit})::interval`,
    until,
    local,
  };
}

export const SHOP_SORTS = {
  itemsTotal: 'items_total',
  orders: 'orders',
  commission: 'commission',
  balance: 'balance',
  cancelRate: 'cancelled::float / nullif(placed, 0)',
  returnRate: 'returns::float / nullif(orders, 0)',
} as const;
export type ShopSort = keyof typeof SHOP_SORTS;
const SHOP_PAGE = 20;
const CSV_LIMIT = 10_000;

export const ENTRY_TYPES = [
  'cod',
  'order',
  'return',
  'refund',
  'payment',
  'payout',
  'transfer',
] as const;
export interface EntryFilter {
  type?: (typeof ENTRY_TYPES)[number];
  shopId?: string;
  from?: string;
  to?: string;
}

// Days are Vietnam days; `to` is included.
const entryWhere = ({
  type,
  shopId,
  from,
  to,
}: EntryFilter): Prisma.LedgerEntryWhereInput => ({
  refType: type,
  ...(shopId && { lines: { some: { account: { shopId } } } }),
  createdAt: {
    ...(from && { gte: new Date(`${from}T00:00:00+07:00`) }),
    ...(to && {
      lt: new Date(new Date(`${to}T00:00:00+07:00`).getTime() + 86_400_000),
    }),
  },
});

const entryInclude = {
  lines: {
    orderBy: { amount: 'desc' },
    include: {
      account: { include: { shop: { select: { id: true, name: true } } } },
    },
  },
} satisfies Prisma.LedgerEntryInclude;

const entryView = (
  e: Prisma.LedgerEntryGetPayload<{ include: typeof entryInclude }>,
) => ({
  id: e.id,
  refType: e.refType,
  refId: e.refId,
  createdAt: e.createdAt,
  lines: e.lines.map((l) => ({
    id: l.id,
    account: l.account.type,
    shop: l.account.shop,
    amount: l.amount,
  })),
});

@Injectable()
export class LedgerService {
  private readonly rateBps = commissionRateBps();

  constructor(private readonly prisma: PrismaService) {}

  async settleOrder(
    tx: Prisma.TransactionClient,
    order: {
      id: string;
      shopId: string;
      itemsTotal: number;
      sellerDiscount: number;
      platformDiscount: number;
      shippingFee: number;
      shippingDiscount: number;
      freeshipFee: number;
      total: number;
      paymentMethod: PaymentMethod;
    },
  ) {
    // Commission is charged after the shop's own discount, before the platform's.
    const sellerRevenue = order.itemsTotal - order.sellerDiscount;
    const commission = Math.round((sellerRevenue * this.rateBps) / 10_000);
    // Cash on delivery is still owed by the carrier; an online order was paid upfront.
    const source = await this.account(
      tx,
      order.paymentMethod === PaymentMethod.cod
        ? LedgerAccountType.receivable
        : LedgerAccountType.prepaid,
    );
    const commissionAccount = await this.account(
      tx,
      LedgerAccountType.commission,
    );
    const shipping = await this.account(tx, LedgerAccountType.shipping);
    const wallet = await this.walletAccount(tx, order.shopId);
    await this.post(tx, {
      idempotencyKey: `order:${order.id}:settlement`,
      refType: 'order',
      refId: order.id,
      lines: [
        { account: source, amount: order.total },
        {
          account: await this.account(tx, LedgerAccountType.promotion),
          amount: order.platformDiscount + order.shippingDiscount,
        },
        {
          account: wallet,
          amount: -(sellerRevenue - commission - order.freeshipFee),
        },
        { account: commissionAccount, amount: -commission },
        {
          account: await this.account(tx, LedgerAccountType.service_fee),
          amount: -order.freeshipFee,
        },
        { account: shipping, amount: -order.shippingFee },
      ],
    });
  }

  // Held as prepaid until the orders complete.
  async receivePayment(
    tx: Prisma.TransactionClient,
    payment: { id: string; amount: number },
  ) {
    await this.post(tx, {
      idempotencyKey: `payment:${payment.id}:received`,
      refType: 'payment',
      refId: payment.id,
      lines: [
        {
          account: await this.account(tx, LedgerAccountType.bank),
          amount: payment.amount,
        },
        {
          account: await this.account(tx, LedgerAccountType.prepaid),
          amount: -payment.amount,
        },
      ],
    });
  }

  // Unmatched money is owed back to the sender.
  async receiveUnmatched(
    tx: Prisma.TransactionClient,
    transfer: { id: string; amount: number },
  ) {
    await tx.refund.createMany({
      data: { bankTransferId: transfer.id, amount: transfer.amount },
      skipDuplicates: true,
    });
    await this.post(tx, {
      idempotencyKey: `transfer:${transfer.id}:unmatched`,
      refType: 'transfer',
      refId: transfer.id,
      lines: [
        {
          account: await this.account(tx, LedgerAccountType.bank),
          amount: transfer.amount,
        },
        {
          account: await this.account(tx, LedgerAccountType.refund_due),
          amount: -transfer.amount,
        },
      ],
    });
  }

  // Undoes the settlement of a returned order: the seller, commission, carrier and promotion lines
  // flip, and what the buyer paid becomes owed back.
  async reverseSettlement(
    tx: Prisma.TransactionClient,
    order: { id: string; total: number },
  ) {
    const settlement = await tx.ledgerEntry.findUniqueOrThrow({
      where: { idempotencyKey: `order:${order.id}:settlement` },
      include: { lines: { include: { account: true } } },
    });
    const flipped = settlement.lines
      .filter(
        (l) =>
          l.account.type !== LedgerAccountType.receivable &&
          l.account.type !== LedgerAccountType.prepaid,
      )
      .map((l) => ({ account: l.accountId, amount: -l.amount }));
    await this.post(tx, {
      idempotencyKey: `order:${order.id}:return`,
      refType: 'return',
      refId: order.id,
      lines: [
        ...flipped,
        {
          account: await this.account(tx, LedgerAccountType.refund_due),
          amount: -order.total,
        },
      ],
    });
    if (order.total > 0) {
      await tx.refund.createMany({
        data: { orderId: order.id, amount: order.total },
        skipDuplicates: true,
      });
    }
  }

  async refundOrder(
    tx: Prisma.TransactionClient,
    order: { id: string; total: number },
  ) {
    await tx.refund.createMany({
      data: { orderId: order.id, amount: order.total },
      skipDuplicates: true,
    });
    await this.post(tx, {
      idempotencyKey: `order:${order.id}:refund`,
      // Not 'order': the report counts 'order' entries as settled orders.
      refType: 'refund',
      refId: order.id,
      lines: [
        {
          account: await this.account(tx, LedgerAccountType.prepaid),
          amount: order.total,
        },
        {
          account: await this.account(tx, LedgerAccountType.refund_due),
          amount: -order.total,
        },
      ],
    });
  }

  // shortcut: the admin sends the money by hand and then records it here.
  async payRefund(
    tx: Prisma.TransactionClient,
    refund: { id: string; amount: number },
  ) {
    await this.pair(tx, `refund:${refund.id}:paid`, 'refund', refund.id, {
      debit: await this.account(tx, LedgerAccountType.refund_due),
      credit: await this.account(tx, LedgerAccountType.bank),
      amount: refund.amount,
    });
  }

  // The carrier hands over COD cash it collected. Assumption: carriers remit in batches that the admin
  // records from their statement; shortcut: entered by hand, import the statement once a carrier API exists.
  // Assumption: the carrier keeps the shipping fees the platform owes it out of each batch, so that debt
  // is settled first and only the rest reaches the bank.
  async remitCod(amount: number, key: string) {
    return this.prisma.$transaction(async (tx) => {
      const receivable = await this.account(tx, LedgerAccountType.receivable);
      const shipping = await this.account(tx, LedgerAccountType.shipping);
      await tx.$queryRaw`SELECT id FROM ledger_accounts WHERE id IN (${receivable}::uuid, ${shipping}::uuid) ORDER BY id FOR UPDATE`;
      const sum = async (accountId: string) =>
        (
          await tx.ledgerLine.aggregate({
            where: { accountId },
            _sum: { amount: true },
          })
        )._sum.amount ?? 0;
      const idempotencyKey = `cod:${key}`;
      const replay = await tx.ledgerEntry.findUnique({
        where: { idempotencyKey },
      });
      if (!replay) {
        if (amount > (await sum(receivable))) {
          throw new ConflictException(
            'Amount exceeds the COD the carrier holds',
          );
        }
        const fee = Math.max(0, Math.min(amount, -(await sum(shipping))));
        await this.post(tx, {
          idempotencyKey,
          refType: 'cod',
          refId: randomUUID(),
          lines: [
            {
              account: await this.account(tx, LedgerAccountType.bank),
              amount: amount - fee,
            },
            { account: shipping, amount: fee },
            { account: receivable, amount: -amount },
          ],
        });
      }
      const entry = await tx.ledgerEntry.findUniqueOrThrow({
        where: { idempotencyKey },
        include: { lines: true },
      });
      const line = (account: string) =>
        entry.lines.find((l) => l.accountId === account)?.amount ?? 0;
      return {
        amount: -line(receivable),
        shippingFee: line(shipping),
        received: -line(receivable) - line(shipping),
      };
    });
  }

  // Locks the wallet, so concurrent payout requests cannot both spend the same balance.
  async lockWalletBalance(tx: Prisma.TransactionClient, shopId: string) {
    const [wallet] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM ledger_accounts WHERE shop_id = ${shopId}::uuid FOR UPDATE`;
    const sum = await tx.ledgerLine.aggregate({
      where: { accountId: wallet.id },
      _sum: { amount: true },
    });
    return -(sum._sum.amount ?? 0);
  }

  async payout(
    tx: Prisma.TransactionClient,
    payout: { id: string; shopId: string; amount: number },
  ) {
    await this.pair(tx, `payout:${payout.id}:paid`, 'payout', payout.id, {
      debit: await this.walletAccount(tx, payout.shopId),
      credit: await this.account(tx, LedgerAccountType.bank),
      amount: payout.amount,
    });
  }

  async wallet(ownerId: string, query: CursorQuery) {
    return this.walletPage(await this.shopAccount(ownerId), query);
  }

  async shopWallet(shopId: string, query: CursorQuery) {
    const account = await this.prisma.ledgerAccount.findUnique({
      where: { shopId },
    });
    if (!account) throw new NotFoundException('Shop not found');
    return this.walletPage(account.id, query);
  }

  private async walletPage(account: string, query: CursorQuery) {
    const [sum, lines] = await Promise.all([
      this.prisma.ledgerLine.aggregate({
        where: { accountId: account },
        _sum: { amount: true },
      }),
      this.prisma.ledgerLine.findMany({
        where: { accountId: account },
        include: { entry: true },
        ...cursorArgs(query, 'desc'),
      }),
    ]);
    const page = toPage(lines, query.limit);
    return {
      balance: -(sum._sum.amount ?? 0),
      ...page,
      items: await this.walletView(page.items),
    };
  }

  private async shopAccount(ownerId: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { ownerId },
      include: { ledgerAccount: true },
    });
    if (!shop) throw new NotFoundException('You do not have a shop');
    return shop.ledgerAccount!.id;
  }

  private async walletView(
    lines: Prisma.LedgerLineGetPayload<{ include: { entry: true } }>[],
  ) {
    const orders = new Map(
      (
        await this.prisma.order.findMany({
          where: {
            id: {
              in: lines
                .filter((l) => l.entry.refType !== 'payout')
                .map((l) => l.entry.refId),
            },
          },
          select: {
            id: true,
            itemsTotal: true,
            sellerDiscount: true,
            freeshipFee: true,
          },
        })
      ).map((o) => [o.id, o]),
    );
    const payouts = new Map(
      (
        await this.prisma.payout.findMany({
          where: {
            id: {
              in: lines
                .filter((l) => l.entry.refType === 'payout')
                .map((l) => l.entry.refId),
            },
          },
        })
      ).map((p) => [p.id, p]),
    );
    return lines.map((l) => {
      const order = orders.get(l.entry.refId);
      const payout = payouts.get(l.entry.refId);
      return {
        id: l.id,
        amount: -l.amount,
        refType: l.entry.refType,
        refId: l.entry.refId,
        createdAt: l.entry.createdAt,
        // What the shop earned on the order and what the platform kept; a return takes it all back.
        breakdown: order && {
          itemsTotal: order.itemsTotal,
          sellerDiscount: order.sellerDiscount,
          freeshipFee: order.freeshipFee,
          commission:
            order.itemsTotal -
            order.sellerDiscount -
            order.freeshipFee -
            Math.abs(l.amount),
        },
        payout: payout && {
          bankName: payout.bankName,
          accountNumber: payout.accountNumber,
          accountName: payout.accountName,
          status: payout.status,
          createdAt: payout.createdAt,
          decidedAt: payout.decidedAt,
        },
      };
    });
  }

  async balances() {
    const [accounts, sums] = await Promise.all([
      this.prisma.ledgerAccount.findMany({
        orderBy: { id: 'asc' },
        include: { shop: { select: { id: true, name: true } } },
      }),
      this.prisma.ledgerLine.groupBy({
        by: ['accountId'],
        _sum: { amount: true },
      }),
    ]);
    const byAccount = new Map(sums.map((s) => [s.accountId, s._sum.amount]));
    const items = accounts.map((a) => ({
      id: a.id,
      type: a.type,
      shop: a.shop,
      balance: byAccount.get(a.id) ?? 0,
    }));
    const byType = Object.fromEntries(
      Object.values(LedgerAccountType).map((type) => [type, 0]),
    ) as Record<LedgerAccountType, number>;
    for (const a of items) byType[a.type] += a.balance;
    return {
      items,
      byType,
      total: items.reduce((sum, a) => sum + a.balance, 0),
    };
  }

  // Profit is commission and program fees minus platform-funded discounts; buckets use Vietnam time and include empty periods.
  async report(window: ReportWindow) {
    const { unit, label, start, end, until, local } = reportWindow(window);

    const [rows, [counts]] = await Promise.all([
      this.prisma.$queryRaw<
        {
          period: string;
          orders: bigint;
          commission: bigint;
          fees: bigint;
          sellers: bigint;
          shipping: bigint;
          promotion: bigint;
        }[]
      >`
        SELECT to_char(b.bucket, ${label}) AS period,
               count(DISTINCT e.id) FILTER (WHERE e.ref_type = 'order') AS orders,
               coalesce(-sum(l.amount) FILTER (WHERE e.ref_type IN ('order', 'return') AND a.type = 'commission'), 0) AS commission,
               coalesce(-sum(l.amount) FILTER (WHERE e.ref_type IN ('order', 'return') AND a.type = 'service_fee'), 0) AS fees,
               coalesce(-sum(l.amount) FILTER (WHERE e.ref_type IN ('order', 'return') AND a.type = 'wallet'), 0) AS sellers,
               coalesce(-sum(l.amount) FILTER (WHERE e.ref_type IN ('order', 'return') AND a.type = 'shipping'), 0) AS shipping,
               coalesce(sum(l.amount) FILTER (WHERE e.ref_type IN ('order', 'return') AND a.type = 'promotion'), 0) AS promotion
        FROM generate_series(${start}, ${end}, ('1 ' || ${unit})::interval) AS b(bucket)
        LEFT JOIN ledger_entries e
          ON date_trunc(${unit}, ${local(Prisma.sql`e.created_at`)}) = b.bucket
        LEFT JOIN ledger_lines l ON l.entry_id = e.id
        LEFT JOIN ledger_accounts a ON a.id = l.account_id
        GROUP BY b.bucket
        ORDER BY b.bucket`,
      this.prisma.$queryRaw<
        {
          cancelled: bigint;
          users: bigint;
          shops: bigint;
          vouchers: bigint;
          subsidy: bigint;
        }[]
      >`
        SELECT
          (SELECT coalesce(sum(CASE e.ref_type WHEN 'order' THEN o.platform_discount ELSE -o.platform_discount END), 0)
            FROM ledger_entries e JOIN orders o ON o.id = e.ref_id
            WHERE e.ref_type IN ('order', 'return')
              AND ${local(Prisma.sql`e.created_at`)} >= ${start}
              AND ${local(Prisma.sql`e.created_at`)} < ${until}) AS vouchers,
          (SELECT coalesce(sum(CASE e.ref_type WHEN 'order' THEN o.shipping_discount ELSE -o.shipping_discount END), 0)
            FROM ledger_entries e JOIN orders o ON o.id = e.ref_id
            WHERE e.ref_type IN ('order', 'return')
              AND ${local(Prisma.sql`e.created_at`)} >= ${start}
              AND ${local(Prisma.sql`e.created_at`)} < ${until}) AS subsidy,
          (SELECT count(*) FROM order_status_history h
            WHERE h.to_status = 'cancelled'
              AND ${local(Prisma.sql`h.created_at`)} >= ${start}
              AND ${local(Prisma.sql`h.created_at`)} < ${until}) AS cancelled,
          (SELECT count(*) FROM users u
            WHERE ${local(Prisma.sql`u.created_at`)} >= ${start}
              AND ${local(Prisma.sql`u.created_at`)} < ${until}) AS users,
          (SELECT count(*) FROM shops s
            WHERE ${local(Prisma.sql`s.created_at`)} >= ${start}
              AND ${local(Prisma.sql`s.created_at`)} < ${until}) AS shops`,
    ]);

    const series = rows.map((r) => ({
      period: r.period,
      orders: Number(r.orders),
      itemsTotal: Number(r.commission + r.fees + r.sellers),
      serviceFees: Number(r.fees),
      shippingFees: Number(r.shipping),
      promotions: Number(r.promotion),
      profit: Number(r.commission + r.fees - r.promotion),
    }));
    const sum = (
      key:
        | 'orders'
        | 'itemsTotal'
        | 'serviceFees'
        | 'shippingFees'
        | 'promotions'
        | 'profit',
    ) => series.reduce((n, p) => n + p[key], 0);
    const orders = sum('orders');
    return {
      ...window,
      totals: {
        profit: sum('profit'),
        commission: sum('profit') + sum('promotions') - sum('serviceFees'),
        serviceFee: sum('serviceFees'),
        platformVouchers: Number(counts.vouchers),
        shippingSubsidy: Number(counts.subsidy),
        itemsTotal: sum('itemsTotal'),
        shippingFees: sum('shippingFees'),
        promotions: sum('promotions'),
        orders,
        averageOrder: orders ? Math.round(sum('itemsTotal') / orders) : 0,
        cancelledOrders: Number(counts.cancelled),
        newUsers: Number(counts.users),
        newShops: Number(counts.shops),
      },
      series,
    };
  }

  // Every shop's trade in the window next to its wallet, for the admin; sorted and paged in SQL.
  async shopsReport({
    q,
    sort,
    page,
    ...window
  }: ReportWindow & {
    q?: string;
    sort: ShopSort;
    page: number;
  }) {
    const { start, until, local } = reportWindow(window);
    const inRange = (column: Prisma.Sql) =>
      Prisma.sql`${local(column)} >= ${start} AND ${local(column)} < ${until}`;
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        name: string;
        status: string;
        items_total: bigint;
        orders: bigint;
        returns: bigint;
        commission: bigint;
        service_fee: bigint;
        freeship: boolean;
        seller_discount: bigint;
        placed: bigint;
        cancelled: bigint;
        balance: bigint;
        last_payout: Date | null;
        total: bigint;
      }[]
    >`
      WITH settled AS (
        SELECT o.shop_id,
          sum(CASE e.ref_type WHEN 'order' THEN o.items_total ELSE -o.items_total END) AS items_total,
          sum(CASE e.ref_type WHEN 'order' THEN o.seller_discount ELSE -o.seller_discount END) AS seller_discount,
          count(*) FILTER (WHERE e.ref_type = 'order') AS orders,
          count(*) FILTER (WHERE e.ref_type = 'return') AS returns
        FROM ledger_entries e JOIN orders o ON o.id = e.ref_id
        WHERE e.ref_type IN ('order', 'return') AND ${inRange(Prisma.sql`e.created_at`)}
        GROUP BY o.shop_id),
      fees AS (
        SELECT o.shop_id,
          -sum(l.amount) FILTER (WHERE a.type = 'commission') AS commission,
          -sum(l.amount) FILTER (WHERE a.type = 'service_fee') AS service_fee
        FROM ledger_entries e
        JOIN orders o ON o.id = e.ref_id
        JOIN ledger_lines l ON l.entry_id = e.id
        JOIN ledger_accounts a ON a.id = l.account_id AND a.type IN ('commission', 'service_fee')
        WHERE e.ref_type IN ('order', 'return') AND ${inRange(Prisma.sql`e.created_at`)}
        GROUP BY o.shop_id),
      placed AS (
        SELECT shop_id, count(*) AS placed FROM orders
        WHERE ${inRange(Prisma.sql`created_at`)} GROUP BY shop_id),
      cancelled AS (
        SELECT o.shop_id, count(*) AS cancelled
        FROM order_status_history h JOIN orders o ON o.id = h.order_id
        WHERE h.to_status = 'cancelled' AND ${inRange(Prisma.sql`h.created_at`)}
        GROUP BY o.shop_id),
      wallets AS (
        SELECT a.shop_id, -sum(l.amount) AS balance
        FROM ledger_accounts a JOIN ledger_lines l ON l.account_id = a.id
        WHERE a.shop_id IS NOT NULL GROUP BY a.shop_id),
      payouts AS (SELECT shop_id, max(created_at) AS last_payout FROM payouts GROUP BY shop_id),
      board AS (
        SELECT s.id, s.name, s.status::text AS status,
          coalesce(st.items_total, 0) AS items_total,
          coalesce(st.orders, 0) AS orders,
          coalesce(st.returns, 0) AS returns,
          coalesce(st.seller_discount, 0) AS seller_discount,
          coalesce(f.commission, 0) AS commission,
          coalesce(f.service_fee, 0) AS service_fee,
          s.freeship,
          coalesce(p.placed, 0) AS placed,
          coalesce(c.cancelled, 0) AS cancelled,
          coalesce(w.balance, 0) AS balance,
          po.last_payout
        FROM shops s
        LEFT JOIN settled st ON st.shop_id = s.id
        LEFT JOIN fees f ON f.shop_id = s.id
        LEFT JOIN placed p ON p.shop_id = s.id
        LEFT JOIN cancelled c ON c.shop_id = s.id
        LEFT JOIN wallets w ON w.shop_id = s.id
        LEFT JOIN payouts po ON po.shop_id = s.id
        WHERE s.status <> 'pending'
          AND (${q ?? ''} = '' OR search_text(s.name) LIKE '%' || search_text(${q ?? ''}) || '%'))
      SELECT *, count(*) OVER () AS total FROM board
      ORDER BY ${Prisma.raw(SHOP_SORTS[sort])} DESC NULLS LAST, id
      LIMIT ${SHOP_PAGE} OFFSET ${(page - 1) * SHOP_PAGE}`;
    const total = Number(rows[0]?.total ?? 0);
    return {
      page,
      total,
      hasMore: page * SHOP_PAGE < total,
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        itemsTotal: Number(r.items_total),
        orders: Number(r.orders),
        returns: Number(r.returns),
        sellerDiscount: Number(r.seller_discount),
        commission: Number(r.commission),
        serviceFee: Number(r.service_fee),
        freeship: r.freeship,
        placed: Number(r.placed),
        cancelled: Number(r.cancelled),
        balance: Number(r.balance),
        lastPayout: r.last_payout,
      })),
    };
  }

  // The journal: every entry with all its lines, newest first.
  async entries(query: EntryFilter & CursorQuery) {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: entryWhere(query),
      include: entryInclude,
      ...cursorArgs(query, 'desc'),
    });
    const page = toPage(entries, query.limit);
    const notes = await this.describe(page.items);
    return {
      ...page,
      items: page.items.map((e) => ({
        ...entryView(e),
        description: notes.get(e.id) ?? '',
      })),
    };
  }

  // One line of plain words per entry: which order, shop, buyer or bank account it is about.
  private async describe(
    entries: { id: string; refType: string; refId: string }[],
  ) {
    const ids = (...types: string[]) =>
      entries.filter((e) => types.includes(e.refType)).map((e) => e.refId);
    const [orders, payments, payouts, transfers, refunds] = await Promise.all([
      this.prisma.order.findMany({
        where: { id: { in: ids('order', 'return', 'refund') } },
        select: {
          id: true,
          shop: { select: { name: true } },
          buyer: { select: { username: true } },
        },
      }),
      this.prisma.payment.findMany({
        where: { id: { in: ids('payment') } },
        select: {
          id: true,
          code: true,
          checkout: { select: { buyer: { select: { username: true } } } },
        },
      }),
      this.prisma.payout.findMany({
        where: { id: { in: ids('payout') } },
        include: { shop: { select: { name: true } } },
      }),
      this.prisma.bankTransfer.findMany({
        where: { id: { in: ids('transfer') } },
        select: { id: true, content: true },
      }),
      this.prisma.refund.findMany({
        where: { id: { in: ids('refund') } },
        select: {
          id: true,
          orderId: true,
          bankTransfer: { select: { content: true } },
        },
      }),
    ]);
    const byId = <T extends { id: string }>(rows: T[]) =>
      new Map(rows.map((r) => [r.id, r]));
    const order = byId(orders);
    const payment = byId(payments);
    const payout = byId(payouts);
    const transfer = byId(transfers);
    const refund = byId(refunds);
    const code = (id: string) => id.slice(-8).toUpperCase();
    const ofOrder = (id: string) => {
      const o = order.get(id);
      return o
        ? `đơn ${code(id)} của ${o.shop.name}, người mua ${o.buyer.username}`
        : `đơn ${code(id)}`;
    };
    return new Map(
      entries.map((e) => {
        const id = e.refId;
        switch (e.refType) {
          case 'order':
            return [e.id, `Hoàn thành ${ofOrder(id)}`];
          case 'return':
            return [e.id, `Trả hàng ${ofOrder(id)}`];
          case 'refund': {
            // An order id: a paid order was cancelled. A refund id: the admin sent the money back.
            if (order.has(id))
              return [e.id, `Hủy ${ofOrder(id)}, chờ hoàn tiền`];
            const r = refund.get(id);
            return [
              e.id,
              r?.orderId
                ? `Đã hoàn tiền ${ofOrder(r.orderId)}`
                : `Đã hoàn chuyển khoản lạ "${r?.bankTransfer?.content ?? ''}"`,
            ];
          }
          case 'payment': {
            const p = payment.get(id);
            return [
              e.id,
              `${p?.checkout.buyer.username ?? 'Người mua'} thanh toán mã ${p?.code ?? ''}`,
            ];
          }
          case 'payout': {
            const p = payout.get(id);
            return [
              e.id,
              p
                ? `${p.shop.name} rút về ${p.bankName} ${p.accountNumber} (${p.accountName})`
                : 'Rút tiền',
            ];
          }
          case 'transfer':
            return [
              e.id,
              `Chuyển khoản không khớp mã: "${transfer.get(id)?.content ?? ''}"`,
            ];
          case 'cod':
            return [e.id, 'Đơn vị vận chuyển nộp tiền COD'];
          default:
            return [e.id, ''];
        }
      }),
    );
  }

  // shortcut: at most CSV_LIMIT entries in one file; stream it if the journal outgrows that.
  async entriesCsv(query: EntryFilter) {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: entryWhere(query),
      include: entryInclude,
      orderBy: { id: 'desc' },
      take: CSV_LIMIT,
    });
    const notes = await this.describe(entries);
    const rows = entries.flatMap((e) =>
      e.lines.map((l) => [
        e.createdAt.toISOString(),
        e.id,
        e.refType,
        notes.get(e.id) ?? '',
        e.refId,
        l.account.type,
        l.account.shop?.name ?? '',
        l.amount > 0 ? l.amount : '',
        l.amount < 0 ? -l.amount : '',
      ]),
    );
    return (
      '\uFEFF' +
      toCsv([
        [
          'Thời gian',
          'Bút toán',
          'Loại',
          'Diễn giải',
          'Tham chiếu',
          'Tài khoản',
          'Cửa hàng',
          'Nợ',
          'Có',
        ],
        ...rows,
      ])
    );
  }

  // Earnings are what completed orders paid into the wallet after commission, less what returns took back.
  async shopReport(ownerId: string, window: ReportWindow) {
    const shop = await this.prisma.shop.findUnique({
      where: { ownerId },
      include: { ledgerAccount: true },
    });
    if (!shop) throw new NotFoundException('You do not have a shop');
    const walletId = shop.ledgerAccount!.id;
    const { unit, label, start, end, until, local } = reportWindow(window);
    const inRange = (column: Prisma.Sql) =>
      Prisma.sql`${local(column)} >= ${start} AND ${local(column)} < ${until}`;

    const [rows, [counts], balance] = await Promise.all([
      this.prisma.$queryRaw<
        {
          period: string;
          orders: bigint;
          returns: bigint;
          earnings: bigint;
          returned: bigint;
          items: bigint;
          discounts: bigint;
          fees: bigint;
        }[]
      >`
        SELECT to_char(b.bucket, ${label}) AS period,
               count(e.id) FILTER (WHERE e.ref_type = 'order') AS orders,
               count(e.id) FILTER (WHERE e.ref_type = 'return') AS returns,
               coalesce(-sum(l.amount) FILTER (WHERE e.ref_type = 'order'), 0) AS earnings,
               coalesce(sum(l.amount) FILTER (WHERE e.ref_type = 'return'), 0) AS returned,
               coalesce(sum(o.items_total) FILTER (WHERE e.ref_type = 'order'), 0) AS items,
               coalesce(sum(o.seller_discount) FILTER (WHERE e.ref_type = 'order'), 0) AS discounts,
               coalesce(sum(o.freeship_fee) FILTER (WHERE e.ref_type = 'order'), 0) AS fees
        FROM generate_series(${start}, ${end}, ('1 ' || ${unit})::interval) AS b(bucket)
        LEFT JOIN (ledger_entries e
          JOIN ledger_lines l ON l.entry_id = e.id AND l.account_id = ${walletId}::uuid
          JOIN orders o ON o.id = e.ref_id)
          ON e.ref_type IN ('order', 'return')
          AND date_trunc(${unit}, ${local(Prisma.sql`e.created_at`)}) = b.bucket
        GROUP BY b.bucket
        ORDER BY b.bucket`,
      this.prisma.$queryRaw<{ placed: bigint; cancelled: bigint }[]>`
        SELECT
          (SELECT count(*) FROM orders o
            WHERE o.shop_id = ${shop.id}::uuid
              AND ${inRange(Prisma.sql`o.created_at`)}) AS placed,
          (SELECT count(*) FROM order_status_history h
            JOIN orders o ON o.id = h.order_id
            WHERE o.shop_id = ${shop.id}::uuid AND h.to_status = 'cancelled'
              AND ${inRange(Prisma.sql`h.created_at`)}) AS cancelled`,
      this.prisma.ledgerLine.aggregate({
        where: { accountId: walletId },
        _sum: { amount: true },
      }),
    ]);

    const series = rows.map((r) => ({
      period: r.period,
      orders: Number(r.orders),
      returns: Number(r.returns),
      earnings: Number(r.earnings - r.returned),
      returned: Number(r.returned),
      itemsTotal: Number(r.items),
      sellerDiscount: Number(r.discounts),
      freeshipFee: Number(r.fees),
    }));
    const sum = (
      key:
        | 'orders'
        | 'returns'
        | 'earnings'
        | 'returned'
        | 'itemsTotal'
        | 'sellerDiscount'
        | 'freeshipFee',
    ) => series.reduce((n, p) => n + p[key], 0);
    const orders = sum('orders');
    return {
      ...window,
      totals: {
        earnings: sum('earnings'),
        itemsTotal: sum('itemsTotal'),
        sellerDiscount: sum('sellerDiscount'),
        returned: sum('returned'),
        freeshipFee: sum('freeshipFee'),
        commission:
          sum('itemsTotal') -
          sum('sellerDiscount') -
          sum('freeshipFee') -
          sum('earnings') -
          sum('returned'),
        orders,
        averageOrder: orders ? Math.round(sum('itemsTotal') / orders) : 0,
        placedOrders: Number(counts.placed),
        cancelledOrders: Number(counts.cancelled),
        returnedOrders: sum('returns'),
        balance: -(balance._sum.amount ?? 0),
      },
      series,
    };
  }

  private pair(
    tx: Prisma.TransactionClient,
    idempotencyKey: string,
    refType: string,
    refId: string,
    {
      debit,
      credit,
      amount,
    }: { debit: string; credit: string; amount: number },
  ) {
    return this.post(tx, {
      idempotencyKey,
      refType,
      refId,
      lines: [
        { account: debit, amount },
        { account: credit, amount: -amount },
      ],
    });
  }

  private async walletAccount(tx: Prisma.TransactionClient, shopId: string) {
    const { id } = await tx.ledgerAccount.findUniqueOrThrow({
      where: { shopId },
    });
    return id;
  }

  private async post(tx: Prisma.TransactionClient, posting: Posting) {
    const lines = posting.lines.filter((l) => l.amount !== 0);
    if (lines.reduce((sum, l) => sum + l.amount, 0) !== 0) {
      throw new Error(`Unbalanced ledger entry ${posting.idempotencyKey}`);
    }
    const entry = await tx.ledgerEntry.createManyAndReturn({
      data: {
        idempotencyKey: posting.idempotencyKey,
        refType: posting.refType,
        refId: posting.refId,
      },
      skipDuplicates: true,
    });
    if (!entry.length) return;
    await tx.ledgerLine.createMany({
      data: lines.map((l) => ({
        entryId: entry[0].id,
        accountId: l.account,
        amount: l.amount,
      })),
    });
  }

  // Platform accounts are created on first use; shop wallets are created with the shop.
  private async account(
    tx: Prisma.TransactionClient,
    type: Exclude<LedgerAccountType, 'wallet'>,
  ) {
    await tx.ledgerAccount.createMany({ data: { type }, skipDuplicates: true });
    const account = await tx.ledgerAccount.findFirstOrThrow({
      where: { type, shopId: null },
    });
    return account.id;
  }
}
