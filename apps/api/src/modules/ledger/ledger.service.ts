import { Injectable, NotFoundException } from '@nestjs/common';
import { LedgerAccountType, PaymentMethod, Prisma } from '@ecommerce/db';
import {
  cursorArgs,
  toPage,
  type CursorQuery,
} from '../../common/pagination.js';
import { PrismaService } from '../../prisma/prisma.service.js';

interface Posting {
  idempotencyKey: string;
  refType: string;
  refId: string;
  lines: { account: string; amount: number }[];
}

// Assumption: one flat commission rate on item value.
function commissionRateBps() {
  const value = Number(process.env.COMMISSION_RATE_BPS);
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new Error('COMMISSION_RATE_BPS must be an integer from 0 to 10000');
  }
  return value;
}

// shortcut: no holding period or payouts; add them with those features.
export const REPORT_RANGES = ['today', '30d', '12m'] as const;
export type ReportRange = (typeof REPORT_RANGES)[number];

// span is how far before the current bucket the first bucket starts.
const RANGES: Record<
  ReportRange,
  { unit: string; span: string; label: string }
> = {
  today: { unit: 'hour', span: '23 hours', label: 'HH24' },
  '30d': { unit: 'day', span: '29 days', label: 'YYYY-MM-DD' },
  '12m': { unit: 'month', span: '11 months', label: 'YYYY-MM' },
};

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
      shippingFee: number;
      total: number;
      paymentMethod: PaymentMethod;
    },
  ) {
    const commission = Math.round((order.itemsTotal * this.rateBps) / 10_000);
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
    const { id: wallet } = await tx.ledgerAccount.findUniqueOrThrow({
      where: { shopId: order.shopId },
    });
    await this.post(tx, {
      idempotencyKey: `order:${order.id}:settlement`,
      refType: 'order',
      refId: order.id,
      lines: [
        { account: source, amount: order.total },
        { account: wallet, amount: -(order.itemsTotal - commission) },
        { account: commissionAccount, amount: -commission },
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

  // shortcut: refunds are only booked; paying them out stays manual until a refund flow exists.
  async refundOrder(
    tx: Prisma.TransactionClient,
    order: { id: string; total: number },
  ) {
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

  async wallet(ownerId: string, query: CursorQuery) {
    const shop = await this.prisma.shop.findUnique({
      where: { ownerId },
      include: { ledgerAccount: true },
    });
    if (!shop) throw new NotFoundException('You do not have a shop');
    const account = shop.ledgerAccount!;

    const [sum, lines] = await Promise.all([
      this.prisma.ledgerLine.aggregate({
        where: { accountId: account.id },
        _sum: { amount: true },
      }),
      this.prisma.ledgerLine.findMany({
        where: { accountId: account.id },
        include: { entry: true },
        ...cursorArgs(query),
      }),
    ]);
    const page = toPage(lines, query.limit);
    return {
      balance: -(sum._sum.amount ?? 0),
      ...page,
      items: page.items.map((l) => ({
        id: l.id,
        amount: -l.amount,
        refType: l.entry.refType,
        refId: l.entry.refId,
        createdAt: l.entry.createdAt,
      })),
    };
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
    return {
      items,
      total: items.reduce((sum, a) => sum + a.balance, 0),
    };
  }

  // Profit is commission only; buckets use Vietnam time and include empty periods.
  async report(range: ReportRange) {
    const { unit, span, label } = RANGES[range];
    const tz = Prisma.sql`'Asia/Ho_Chi_Minh'`;
    const end = Prisma.sql`date_trunc(${unit}, now() AT TIME ZONE ${tz})`;
    const start = Prisma.sql`${end} - ${span}::interval`;
    const until = Prisma.sql`${end} + ('1 ' || ${unit})::interval`;
    const local = (column: Prisma.Sql) =>
      Prisma.sql`${column} AT TIME ZONE ${tz}`;

    const [rows, [counts]] = await Promise.all([
      this.prisma.$queryRaw<
        {
          period: string;
          orders: bigint;
          commission: bigint;
          sellers: bigint;
          shipping: bigint;
        }[]
      >`
        SELECT to_char(b.bucket, ${label}) AS period,
               count(DISTINCT e.id) FILTER (WHERE e.ref_type = 'order') AS orders,
               coalesce(-sum(l.amount) FILTER (WHERE a.type = 'commission'), 0) AS commission,
               coalesce(-sum(l.amount) FILTER (WHERE a.type = 'wallet'), 0) AS sellers,
               coalesce(-sum(l.amount) FILTER (WHERE a.type = 'shipping'), 0) AS shipping
        FROM generate_series(${start}, ${end}, ('1 ' || ${unit})::interval) AS b(bucket)
        LEFT JOIN ledger_entries e
          ON date_trunc(${unit}, ${local(Prisma.sql`e.created_at`)}) = b.bucket
        LEFT JOIN ledger_lines l ON l.entry_id = e.id
        LEFT JOIN ledger_accounts a ON a.id = l.account_id
        GROUP BY b.bucket
        ORDER BY b.bucket`,
      this.prisma.$queryRaw<
        { cancelled: bigint; users: bigint; shops: bigint }[]
      >`
        SELECT
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
      itemsTotal: Number(r.commission + r.sellers),
      shippingFees: Number(r.shipping),
      profit: Number(r.commission),
    }));
    const sum = (key: 'orders' | 'itemsTotal' | 'shippingFees' | 'profit') =>
      series.reduce((n, p) => n + p[key], 0);
    const orders = sum('orders');
    return {
      range,
      totals: {
        profit: sum('profit'),
        itemsTotal: sum('itemsTotal'),
        shippingFees: sum('shippingFees'),
        orders,
        averageOrder: orders ? Math.round(sum('itemsTotal') / orders) : 0,
        cancelledOrders: Number(counts.cancelled),
        newUsers: Number(counts.users),
        newShops: Number(counts.shops),
      },
      series,
    };
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
