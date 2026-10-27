import type { CancelReason, Location, OrderStatus, ShopStatus } from './types';

const vnd = new Intl.NumberFormat('vi-VN');

export const money = (amount: number) => `${vnd.format(amount)}₫`;

export const priceRange = (min: number, max: number) =>
  min === max ? money(min) : `${money(min)} - ${money(max)}`;

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

export const place = (street: string, location: Location) =>
  `${street}, ${location.ward.name}, ${location.province.name}`;

// Stored as +84XXXXXXXXX; shown in the local 0XXX XXX XXX form.
export const phone = (value: string) =>
  value.replace(/^\+84/, '0').replace(/^(\d{4})(\d{3})(\d{3})$/, '$1 $2 $3');

export const CANCEL_REASON: Record<CancelReason, string> = {
  change_address: 'Muốn thay đổi địa chỉ giao hàng',
  change_items: 'Muốn thay đổi sản phẩm trong đơn hàng',
  change_voucher: 'Muốn nhập hoặc thay đổi mã giảm giá',
  found_cheaper: 'Tìm thấy giá rẻ hơn ở chỗ khác',
  changed_mind: 'Đổi ý, không muốn mua nữa',
  other: 'Lý do khác',
};

export const ORDER_STATUS: Record<OrderStatus, string> = {
  unpaid: 'Chờ thanh toán',
  to_ship: 'Chờ lấy hàng',
  shipping: 'Đang giao',
  delivered: 'Đã giao',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
};

export const SHOP_STATUS: Record<ShopStatus, string> = {
  pending: 'Chờ duyệt',
  active: 'Đang hoạt động',
  rejected: 'Bị từ chối',
  banned: 'Bị khóa',
};

export const PAYMENT_METHOD = {
  cod: 'Thanh toán khi nhận hàng',
  online: 'Thanh toán online',
} as const;

export const REFUND_STATUS = {
  pending: 'Chờ hoàn',
  paid: 'Đã hoàn',
} as const;
