import type {
  CancelReason,
  Location,
  NotificationType,
  OrderStatus,
  ReturnReason,
  ReturnStatus,
  ShopStatus,
} from './types';

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
  returned: 'Đã trả hàng',
};

export const RETURN_REASON: Record<ReturnReason, string> = {
  not_received: 'Chưa nhận được hàng',
  missing_items: 'Thiếu hàng, phụ kiện hoặc quà tặng',
  wrong_item: 'Người bán gửi sai hàng',
  damaged: 'Hàng bể vỡ, hư hỏng',
  defective: 'Hàng lỗi, không hoạt động',
  not_as_described: 'Khác với mô tả',
  counterfeit: 'Hàng giả, nhái',
};

export const RETURN_STATUS: Record<ReturnStatus, string> = {
  requested: 'Chờ người bán phản hồi',
  disputed: 'Chờ sàn xem xét',
  accepted: 'Đã chấp nhận',
  rejected: 'Đã từ chối',
};

export const NOTIFICATION_TYPE: Record<NotificationType, string> = {
  new_order: 'Có đơn hàng mới',
  order_shipping: 'Đơn hàng đang được giao',
  order_delivered: 'Đơn hàng đã giao',
  order_completed: 'Đơn hàng đã hoàn thành',
  order_cancelled: 'Đơn hàng đã bị hủy',
  order_returned: 'Đơn hàng đã được trả',
  return_requested: 'Có yêu cầu trả hàng',
  return_rejected: 'Yêu cầu trả hàng bị từ chối',
  new_review: 'Có đánh giá mới',
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

export const PAYMENT_STATE = {
  pending: 'Chờ thanh toán',
  paid: 'Đã thanh toán',
  expired: 'Hết hạn thanh toán',
  cod_due: 'Thu khi nhận hàng',
  cod_collected: 'Đã thu COD',
  refund_pending: 'Chờ hoàn tiền',
  refunded: 'Đã hoàn tiền',
  none: 'Không phát sinh',
} as const;

export const REFUND_STATUS = {
  pending: 'Chờ hoàn',
  paid: 'Đã hoàn',
} as const;

export const PAYOUT_STATUS = {
  pending: 'Chờ xử lý',
  paid: 'Đã chuyển',
  rejected: 'Bị từ chối',
} as const;

export const VOUCHER_TYPE = {
  shop_voucher: 'Mã giảm giá của shop',
  platform_voucher: 'Mã giảm giá của sàn',
  shipping_voucher: 'Mã miễn phí vận chuyển',
} as const;

export const voucherTerms = (v: {
  discountKind: 'fixed' | 'percent';
  discountValue: number;
  maxDiscount: number | null;
  minSpend: number;
}) =>
  [
    v.discountKind === 'fixed'
      ? `Giảm ${money(v.discountValue)}`
      : `Giảm ${v.discountValue}%${v.maxDiscount ? ` tối đa ${money(v.maxDiscount)}` : ''}`,
    v.minSpend ? `đơn từ ${money(v.minSpend)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
