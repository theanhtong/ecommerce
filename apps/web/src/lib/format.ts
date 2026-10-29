// shortcut: labels come from vi.ts directly; read them through i18n.t once a second language exists.
import vi from '@/i18n/vi';
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

export const CANCEL_REASON: Record<CancelReason, string> =
  vi.labels.cancelReason;

export const ORDER_STATUS: Record<OrderStatus, string> = vi.labels.orderStatus;

export const RETURN_REASON: Record<ReturnReason, string> =
  vi.labels.returnReason;

export const RETURN_STATUS: Record<ReturnStatus, string> =
  vi.labels.returnStatus;

export const NOTIFICATION_TYPE: Record<NotificationType, string> =
  vi.labels.notificationType;

export const SHOP_STATUS: Record<ShopStatus, string> = vi.labels.shopStatus;

export const PAYMENT_METHOD = vi.labels.paymentMethod;

export const PAYMENT_STATE = vi.labels.paymentState;

export const REFUND_STATUS = vi.labels.refundStatus;

export const PAYOUT_STATUS = vi.labels.payoutStatus;

export const VOUCHER_TYPE = vi.labels.voucherType;

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
