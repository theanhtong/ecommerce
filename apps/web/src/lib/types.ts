export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface User {
  id: string;
  email: string;
  username: string;
  role: 'user' | 'admin';
  status: 'active' | 'banned';
  usernameChangedAt: string | null;
  createdAt: string;
}

export type ShopStatus = 'pending' | 'active' | 'rejected' | 'banned';

export interface Shop {
  id: string;
  name: string;
  description: string | null;
  status: ShopStatus;
  createdAt: string;
  owner?: { id: string; email: string; username: string };
}

export interface ItemSummary {
  id: string;
  name: string;
  status: 'active' | 'hidden' | 'banned';
  shop: { id: string; name: string };
  priceMin: number;
  priceMax: number;
  stock: number;
  createdAt: string;
}

export interface Model {
  id: string;
  tierIndex: number[];
  price: number;
  sku: string | null;
  stock: number;
  onHand?: number;
  reserved?: number;
}

export interface ItemDetail {
  id: string;
  name: string;
  description: string | null;
  parentSku: string | null;
  weight: number;
  status: 'active' | 'hidden' | 'banned';
  shop: { id: string; name: string };
  tierVariations: { name: string; options: string[] }[];
  models: Model[];
}

export interface CartLine {
  id: string;
  quantity: number;
  modelId: string;
  itemId: string;
  itemName: string;
  variation: string | null;
  addedPrice: number;
  price: number;
  priceChange: number;
  stock: number;
  purchasable: boolean;
}

export interface Cart {
  shops: { shop: { id: string; name: string }; items: CartLine[] }[];
}

export interface Location {
  ward: { code: string; name: string };
  province: { code: string; name: string };
}

export interface Address extends Location {
  id: string;
  recipientName: string;
  phone: string;
  street: string;
  isDefault: boolean;
}

export interface ShopAddress extends Location {
  contactName: string;
  phone: string;
  street: string;
}

export type MyShop = Shop & ShopAddress;

export type CancelReason =
  | 'change_address'
  | 'change_items'
  | 'change_voucher'
  | 'found_cheaper'
  | 'changed_mind'
  | 'other';

export type OrderStatus =
  | 'unpaid'
  | 'to_ship'
  | 'shipping'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'returned';

export type ReturnReason =
  | 'not_received'
  | 'missing_items'
  | 'wrong_item'
  | 'damaged'
  | 'defective'
  | 'not_as_described'
  | 'counterfeit';

export type ReturnStatus = 'requested' | 'disputed' | 'accepted' | 'rejected';

export interface Order {
  id: string;
  checkoutId: string;
  shop: { id: string; name: string };
  status: OrderStatus;
  paymentMethod: 'cod' | 'online';
  itemsTotal: number;
  sellerDiscount: number;
  platformDiscount: number;
  shippingFee: number;
  shippingDiscount: number;
  total: number;
  shippingAddress: Location & {
    recipientName: string;
    phone: string;
    street: string;
  };
  pickupAddress: Location & {
    contactName: string;
    phone: string;
    street: string;
  };
  cancelReason: CancelReason | null;
  cancelNote: string | null;
  items: {
    modelId: string;
    itemName: string;
    modelName: string | null;
    sku: string | null;
    price: number;
    quantity: number;
  }[];
  history: { from: OrderStatus | null; to: OrderStatus; at: string }[];
  shipment: {
    id: string;
    status: 'awaiting_pickup' | 'picked_up' | 'delivered';
    pickedUpAt: string | null;
    deliveredAt: string | null;
  } | null;
  returnRequest: {
    id: string;
    status: ReturnStatus;
    reason: ReturnReason;
    note: string | null;
    sellerNote: string | null;
    createdAt: string;
    decidedAt: string | null;
  } | null;
  createdAt: string;
}

export interface Province {
  code: string;
  name: string;
  fullName: string;
}

export interface Ward {
  code: string;
  name: string;
  fullName: string;
  type: 'ward' | 'commune' | 'special_zone';
}

export interface Payout {
  id: string;
  amount: number;
  status: 'pending' | 'paid' | 'rejected';
  bankName: string;
  accountNumber: string;
  accountName: string;
  decidedAt: string | null;
  createdAt: string;
}

export interface Refund {
  id: string;
  amount: number;
  status: 'pending' | 'paid';
  paidAt: string | null;
  createdAt: string;
  order: {
    id: string;
    returned: boolean;
    buyer: { id: string; username: string; email: string };
  } | null;
  transfer: {
    content: string;
    referenceCode: string | null;
    createdAt: string;
  } | null;
}

export type VoucherType =
  'shop_voucher' | 'platform_voucher' | 'shipping_voucher';

export interface Voucher {
  id: string;
  type: VoucherType;
  shopId: string | null;
  name: string;
  code: string;
  discountKind: 'fixed' | 'percent';
  discountValue: number;
  maxDiscount: number | null;
  minSpend: number;
  usageLimit: number;
  usedCount: number;
  startsAt: string;
  endsAt: string;
}

export type NotificationType =
  | 'new_order'
  | 'order_shipping'
  | 'order_delivered'
  | 'order_completed'
  | 'order_cancelled'
  | 'order_returned'
  | 'return_requested'
  | 'return_rejected';

export interface Notification {
  id: string;
  type: NotificationType;
  orderId: string;
  audience: 'buyer' | 'seller';
  readAt: string | null;
  createdAt: string;
}
