import type { Prisma } from '@ecommerce/db';
import { reviewView } from '../reviews/review-view.js';

export const orderInclude = {
  checkout: { select: { paymentMethod: true } },
  shop: { select: { id: true, name: true } },
  items: { orderBy: { id: 'asc' }, include: { review: true } },
  history: { orderBy: { id: 'asc' } },
  shipment: true,
  returnRequest: true,
} satisfies Prisma.OrderInclude;

type OrderWithDetails = Prisma.OrderGetPayload<{
  include: typeof orderInclude;
}>;

export const orderView = ({
  items,
  history,
  checkout,
  shipment,
  returnRequest,
  ...order
}: OrderWithDetails) => ({
  id: order.id,
  checkoutId: order.checkoutId,
  shop: order.shop,
  status: order.status,
  paymentMethod: checkout.paymentMethod,
  itemsTotal: order.itemsTotal,
  sellerDiscount: order.sellerDiscount,
  platformDiscount: order.platformDiscount,
  shippingFee: order.shippingFee,
  shippingDiscount: order.shippingDiscount,
  total: order.total,
  shippingAddress: order.shippingAddress,
  pickupAddress: order.pickupAddress,
  cancelReason: order.cancelReason,
  cancelNote: order.cancelNote,
  items: items.map((i) => ({
    id: i.id,
    modelId: i.modelId,
    itemName: i.itemName,
    modelName: i.modelName,
    sku: i.sku,
    price: i.price,
    quantity: i.quantity,
    sellerDiscount: i.sellerDiscount,
    platformDiscount: i.platformDiscount,
    review: i.review && reviewView(i.review),
  })),
  history: history.map((h) => ({
    from: h.fromStatus,
    to: h.toStatus,
    at: h.createdAt,
  })),
  shipment: shipment && {
    id: shipment.id,
    status: shipment.status,
    pickedUpAt: shipment.pickedUpAt,
    deliveredAt: shipment.deliveredAt,
  },
  returnRequest: returnRequest && {
    id: returnRequest.id,
    status: returnRequest.status,
    reason: returnRequest.reason,
    note: returnRequest.note,
    sellerNote: returnRequest.sellerNote,
    createdAt: returnRequest.createdAt,
    decidedAt: returnRequest.decidedAt,
  },
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
});
