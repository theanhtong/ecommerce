import { ConflictException, NotFoundException } from '@nestjs/common';
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

const toActive = (r: {
  id: string;
  price: number;
  quota: number;
  sold: number;
  purchaseLimit: number;
  promotion: { endsAt: Date };
}): ActiveFlashSale => ({
  id: r.id,
  price: r.price,
  quota: r.quota,
  sold: r.sold,
  purchaseLimit: r.purchaseLimit,
  endsAt: r.promotion.endsAt,
});

// Running and not sold out; a model is never in two flash sales at once.
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
  return new Map(
    rows.filter((r) => r.sold < r.quota).map((r) => [r.modelId, toActive(r)]),
  );
}

// What a product page needs to point at its flash sale page.
export const flashSaleView = (sale: ActiveFlashSale) => ({
  id: sale.id,
  price: sale.price,
  endsAt: sale.endsAt,
});

// Assumption: cancelled orders give their units back to the buyer's limit; returned ones do not.
async function boughtAtFlashPrice(
  db: Pick<Prisma.TransactionClient, '$queryRaw'>,
  buyerId: string,
  saleId: string,
) {
  const [{ bought }] = await db.$queryRaw<{ bought: number }[]>`
    SELECT coalesce(sum(oi.quantity), 0)::int AS bought
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE oi.flash_sale_model_id = ${saleId}::uuid
      AND o.buyer_id = ${buyerId}::uuid
      AND o.status <> 'cancelled'`;
  return bought;
}

// How many more units this buyer can still get at the flash sale price.
export async function flashAllowance(
  db: Pick<Prisma.TransactionClient, '$queryRaw'>,
  buyerId: string,
  sale: Pick<ActiveFlashSale, 'id' | 'quota' | 'sold' | 'purchaseLimit'>,
) {
  return Math.max(
    0,
    Math.min(
      sale.quota - sale.sold,
      sale.purchaseLimit - (await boughtAtFlashPrice(db, buyerId, sale.id)),
    ),
  );
}

// With lock, holds the row so the quota and the buyer's limit are read and taken by one checkout at a time.
export async function runningFlashSale(
  tx: Prisma.TransactionClient,
  id: string,
  lock: boolean,
  now = new Date(),
) {
  if (lock) {
    await tx.$queryRaw`SELECT id FROM flash_sale_models WHERE id = ${id}::uuid FOR UPDATE`;
  }
  const row = await tx.flashSaleModel.findUnique({
    where: { id },
    include: { promotion: { select: { startsAt: true, endsAt: true } } },
  });
  if (!row) throw new NotFoundException('Flash sale not found');
  if (row.promotion.startsAt > now || row.promotion.endsAt <= now) {
    throw new ConflictException('Flash sale is not running');
  }
  if (row.sold >= row.quota) throw new ConflictException('Flash sale sold out');
  return { modelId: row.modelId, sale: toActive(row) };
}

export async function claimFlashSale(
  tx: Prisma.TransactionClient,
  sale: ActiveFlashSale,
  quantity: number,
) {
  const claimed = await tx.$executeRaw`
    UPDATE flash_sale_models SET sold = sold + ${quantity}
    WHERE id = ${sale.id}::uuid AND sold + ${quantity} <= quota`;
  if (!claimed) throw new ConflictException('Flash sale sold out');
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
