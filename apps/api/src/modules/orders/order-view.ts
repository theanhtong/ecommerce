import type { Prisma } from '@marketplace/db';
import { reviewView } from '../reviews/review-view.js';
import { mediaUrl } from '../storage/storage.service.js';

export const orderInclude = {
  checkout: {
    select: { paymentMethod: true, payment: { select: { status: true } } },
  },
  refund: { select: { status: true } },
  shop: { select: { id: true, name: true } },
  items: { orderBy: { id: 'asc' }, include: { review: true } },
  history: { orderBy: { id: 'asc' } },
  shipment: true,
  returnRequest: true,
} satisfies Prisma.OrderInclude;

type OrderWithDetails = Prisma.OrderGetPayload<{
  include: typeof orderInclude;
}>;

// Where the buyer's money stands, derived from the payment, the delivery and any refund.
export function paymentState(
  order: Pick<OrderWithDetails, 'checkout' | 'refund' | 'shipment' | 'status'>,
) {
  if (order.refund) {
    return order.refund.status === 'paid' ? 'refunded' : 'refund_pending';
  }
  if (order.checkout.paymentMethod === 'online') {
    return order.checkout.payment?.status ?? 'pending';
  }
  if (order.shipment?.deliveredAt) return 'cod_collected';
  return order.status === 'cancelled' ? 'none' : 'cod_due';
}

export const orderView = ({
  items,
  history,
  checkout,
  shipment,
  returnRequest,
  refund,
  ...order
}: OrderWithDetails) => ({
  id: order.id,
  checkoutId: order.checkoutId,
  shop: order.shop,
  status: order.status,
  paymentMethod: checkout.paymentMethod,
  paymentState: paymentState({
    checkout,
    refund,
    shipment,
    status: order.status,
  }),
  itemsTotal: order.itemsTotal,
  sellerDiscount: order.sellerDiscount,
  platformDiscount: order.platformDiscount,
  shippingFee: order.shippingFee,
  shippingDiscount: order.shippingDiscount,
  total: order.total,
  freeshipFee: order.freeshipFee,
  vouchers: order.vouchers,
  shippingAddress: order.shippingAddress,
  pickupAddress: order.pickupAddress,
  cancelReason: order.cancelReason,
  cancelNote: order.cancelNote,
  items: items.map((i) => ({
    id: i.id,
    modelId: i.modelId,
    itemName: i.itemName,
    modelName: i.modelName,
    image: i.imageKey && mediaUrl(i.imageKey),
    sku: i.sku,
    price: i.price,
    originalPrice: i.originalPrice,
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
