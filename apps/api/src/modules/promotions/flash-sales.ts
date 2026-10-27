import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@ecommerce/db';

type Db = Pick<Prisma.TransactionClient, 'flashSaleModel'>;

export interface ActiveFlashSale {
  id: string;
  price: number;
  quota: number;
  sold: number;
  purchaseLimit: number;
  endsAt: Date;
}

// A flash sale applies while it runs and until its quota sells out; models never sit in two at once.
export async function activeFlashSales(
  db: Db,
  modelIds: string[],
  now = new Date(),
) {
  const rows = await db.flashSaleModel.findMany({
    where: {
      modelId: { in: modelIds },
      promotion: { startsAt: { lte: now }, endsAt: { gt: now } },
    },
    include: { promotion: { select: { endsAt: true } } },
  });
  return new Map<string, ActiveFlashSale>(
    rows
      .filter((r) => r.sold < r.quota)
      .map((r) => [
        r.modelId,
        {
          id: r.id,
          price: r.price,
          quota: r.quota,
          sold: r.sold,
          purchaseLimit: r.purchaseLimit,
          endsAt: r.promotion.endsAt,
        },
      ]),
  );
}

export const flashSaleView = (sale: ActiveFlashSale) => ({
  price: sale.price,
  quota: sale.quota,
  sold: sale.sold,
  purchaseLimit: sale.purchaseLimit,
  endsAt: sale.endsAt,
});

// Assumption: cancelled orders give their units back to the buyer's limit; returned ones do not.
export async function assertWithinLimit(
  tx: Prisma.TransactionClient,
  buyerId: string,
  sale: ActiveFlashSale,
  quantity: number,
) {
  const [{ bought }] = await tx.$queryRaw<{ bought: number }[]>`
    SELECT coalesce(sum(oi.quantity), 0)::int AS bought
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE oi.flash_sale_model_id = ${sale.id}::uuid
      AND o.buyer_id = ${buyerId}::uuid
      AND o.status <> 'cancelled'`;
  if (bought + quantity > sale.purchaseLimit) {
    throw new ConflictException(
      `A buyer can get at most ${sale.purchaseLimit} at the flash sale price`,
    );
  }
}

// Takes units from the quota; the row lock it holds until commit serializes buyers of the same model.
export async function claimFlashSale(
  tx: Prisma.TransactionClient,
  sale: ActiveFlashSale,
  quantity: number,
) {
  const claimed = await tx.$executeRaw`
    UPDATE flash_sale_models SET sold = sold + ${quantity}
    WHERE id = ${sale.id}::uuid AND sold + ${quantity} <= quota`;
  if (!claimed) {
    throw new ConflictException('Flash sale sold out, reload the cart');
  }
}

export function releaseFlashSales(
  tx: Prisma.TransactionClient,
  orderId: string,
) {
  return tx.$executeRaw`
    UPDATE flash_sale_models f SET sold = f.sold - oi.quantity
    FROM order_items oi
    WHERE oi.order_id = ${orderId}::uuid AND oi.flash_sale_model_id = f.id`;
}
