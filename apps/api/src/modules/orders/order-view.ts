import type { Prisma } from '@ecommerce/db';

export const orderInclude = {
  shop: { select: { id: true, name: true } },
  items: { orderBy: { id: 'asc' } },
  history: { orderBy: { id: 'asc' } },
} satisfies Prisma.OrderInclude;

type OrderWithDetails = Prisma.OrderGetPayload<{
  include: typeof orderInclude;
}>;

export const orderView = ({ items, history, ...order }: OrderWithDetails) => ({
  id: order.id,
  checkoutId: order.checkoutId,
  shop: order.shop,
  status: order.status,
  itemsTotal: order.itemsTotal,
  shippingFee: order.shippingFee,
  total: order.total,
  shippingAddress: order.shippingAddress,
  pickupAddress: order.pickupAddress,
  items: items.map((i) => ({
    modelId: i.modelId,
    itemName: i.itemName,
    modelName: i.modelName,
    sku: i.sku,
    price: i.price,
    quantity: i.quantity,
  })),
  history: history.map((h) => ({
    from: h.fromStatus,
    to: h.toStatus,
    at: h.createdAt,
  })),
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
});
