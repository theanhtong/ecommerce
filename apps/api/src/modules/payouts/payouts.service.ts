import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PayoutStatus, Prisma } from '@ecommerce/db';
import { cursorArgs, toPage } from '../../common/pagination.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { LedgerService } from '../ledger/ledger.service.js';
import type { CreatePayoutDto, ListPayoutsQuery } from './dto/payout.dto.js';

const payoutView = (p: Prisma.PayoutGetPayload<object>) => ({
  id: p.id,
  amount: p.amount,
  status: p.status,
  bankName: p.bankName,
  accountNumber: p.accountNumber,
  accountName: p.accountName,
  decidedAt: p.decidedAt,
  createdAt: p.createdAt,
});

@Injectable()
export class PayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  async request(ownerId: string, dto: CreatePayoutDto) {
    const shop = await this.ownShop(ownerId);
    const payout = await this.prisma.$transaction(async (tx) => {
      const balance = await this.ledger.lockWalletBalance(tx, shop.id);
      if (dto.amount > balance) {
        throw new ConflictException('Amount exceeds the wallet balance');
      }
      // shortcut: marked paid at once to simulate automatic disbursement; send it through a payout API before going live.
      const created = await tx.payout.create({
        data: {
          ...dto,
          shopId: shop.id,
          status: PayoutStatus.paid,
          decidedAt: new Date(),
        },
      });
      await this.ledger.payout(tx, created);
      return created;
    });
    return payoutView(payout);
  }

  async listForShop(ownerId: string, query: ListPayoutsQuery) {
    const shop = await this.ownShop(ownerId);
    const rows = await this.prisma.payout.findMany({
      where: { shopId: shop.id, status: query.status },
      ...cursorArgs(query, 'desc'),
    });
    const page = toPage(rows, query.limit);
    return { ...page, items: page.items.map(payoutView) };
  }

  private async ownShop(ownerId: string) {
    const shop = await this.prisma.shop.findUnique({ where: { ownerId } });
    if (!shop) throw new NotFoundException('You do not have a shop');
    return shop;
  }
}
