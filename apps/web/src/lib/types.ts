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
  'unpaid' | 'to_ship' | 'shipping' | 'delivered' | 'completed' | 'cancelled';

export interface Order {
  id: string;
  checkoutId: string;
  shop: { id: string; name: string };
  status: OrderStatus;
  paymentMethod: 'cod' | 'online';
  itemsTotal: number;
  shippingFee: number;
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
