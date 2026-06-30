import { NotificationType, OrderStatus } from '../../generated/prisma/enums.js';

export const ORDER_NOTIFICATION_MAP: Partial<
  Record<OrderStatus, { type: NotificationType; title: string }>
> = {
  PENDING: { type: 'ORDER_PLACED', title: 'Đặt hàng thành công' },
  CONFIRMED: { type: 'ORDER_CONFIRMED', title: 'Đơn hàng đã xác nhận' },
  SHIPPED: { type: 'ORDER_SHIPPED', title: 'Đơn hàng đang giao' },
  DELIVERED: { type: 'ORDER_DELIVERED', title: 'Giao hàng thành công' },
  CANCELLED: { type: 'ORDER_CANCELLED', title: 'Đơn hàng đã hủy' },
};
