import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RefundStatus } from '@ecommerce/db';
import {
  cursorArgs,
  toPage,
  type CursorQuery,
} from '../../common/pagination.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { LedgerService } from '../ledger/ledger.service.js';

const refundInclude = {
  order: {
    select: {
      id: true,
      buyer: { select: { id: true, username: true, email: true } },
    },
  },
  bankTransfer: {
    select: { content: true, referenceCode: true, createdAt: true },
  },
} satisfies Prisma.RefundInclude;

const refundView = ({
  order,
  bankTransfer,
  ...r
}: Prisma.RefundGetPayload<{ include: typeof refundInclude }>) => ({
  id: r.id,
  amount: r.amount,
  status: r.status,
  paidAt: r.paidAt,
  createdAt: r.createdAt,
  order: order && { id: order.id, buyer: order.buyer },
  transfer: bankTransfer,
});

@Injectable()
export class RefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  async list(query: CursorQuery & { status?: RefundStatus }) {
    const rows = await this.prisma.refund.findMany({
      where: { status: query.status },
      include: refundInclude,
      ...cursorArgs(query, 'desc'),
    });
    const page = toPage(rows, query.limit);
    return { ...page, items: page.items.map(refundView) };
  }

  async pay(id: string) {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.refund.updateMany({
        where: { id, status: RefundStatus.pending },
        data: { status: RefundStatus.paid, paidAt: new Date() },
      });
      const refund = await tx.refund.findUnique({ where: { id } });
      if (!refund) throw new NotFoundException('Refund not found');
      if (count === 0) {
        throw new ConflictException(`Refund is ${refund.status}`);
      }
      await this.ledger.payRefund(tx, refund);
    });
    return refundView(
      await this.prisma.refund.findUniqueOrThrow({
        where: { id },
        include: refundInclude,
      }),
    );
  }
}
