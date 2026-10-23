import { Injectable, NotFoundException } from '@nestjs/common';
import { LedgerAccountType, Prisma } from '@ecommerce/db';
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

// shortcut: no holding period, payouts, refunds or vouchers; add them with those features.
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
    },
  ) {
    const commission = Math.round((order.itemsTotal * this.rateBps) / 10_000);
    const receivable = await this.account(tx, LedgerAccountType.receivable);
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
        { account: receivable, amount: order.total },
        { account: wallet, amount: -(order.itemsTotal - commission) },
        { account: commissionAccount, amount: -commission },
        { account: shipping, amount: -order.shippingFee },
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
      this.prisma.ledgerAccount.findMany({ orderBy: { id: 'asc' } }),
      this.prisma.ledgerLine.groupBy({
        by: ['accountId'],
        _sum: { amount: true },
      }),
    ]);
    const byAccount = new Map(sums.map((s) => [s.accountId, s._sum.amount]));
    const items = accounts.map((a) => ({
      id: a.id,
      type: a.type,
      shopId: a.shopId,
      balance: byAccount.get(a.id) ?? 0,
    }));
    return {
      items,
      total: items.reduce((sum, a) => sum + a.balance, 0),
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
