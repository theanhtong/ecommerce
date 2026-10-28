import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  ChevronLeft,
  MapPin,
  PackageCheck,
  Store,
  TicketPercent,
} from 'lucide-react';
import { Fragment, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import {
  AddressBlock,
  Empty,
  ErrorMessage,
  ItemImage,
  Pager,
  Loading,
  OrderStatusBadge,
  PageHeader,
  QuantityInput,
  StockLabel,
} from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { SalePrice } from '@/components/flash-sale';
import { LineReview } from '@/components/reviews';
import { VoucherPicker } from '@/components/voucher-picker';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import {
  CANCEL_REASON,
  dateTime,
  money,
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATE,
  phone,
  RETURN_REASON,
  RETURN_STATUS,
  place,
  VOUCHER_TYPE,
  voucherTerms,
} from '@/lib/format';
import { useCart, useFees, usePaged } from '@/lib/queries';
import type {
  Address,
  CancelReason,
  Cart,
  CartLine,
  FlashSalePage,
  Order,
  OrderStatus,
  ReturnReason,
  Voucher,
} from '@/lib/types';

const CART_COLS =
  'flex flex-wrap items-center gap-4 md:grid md:grid-cols-[1rem_1fr_7rem_8rem_7rem_4rem]';

export function CartPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const cart = useCart();
  const [selected, setSelected] = useState<string[]>([]);
  const setCart = (data: Cart) => queryClient.setQueryData(['cart'], data);
  const update = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) =>
      api<Cart>(`/cart/items/${id}`, { method: 'PATCH', body: { quantity } }),
    onSuccess: setCart,
    onError: () => void cart.refetch(),
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api<Cart>(`/cart/items/${id}`, { method: 'DELETE' }),
    onSuccess: (data, id) => {
      setCart(data);
      setSelected((s) => s.filter((x) => x !== id));
    },
  });

  if (cart.isPending) return <Loading />;
  if (cart.error) return <ErrorMessage error={cart.error} />;
  const lines = cart.data.shops.flatMap((g) => g.items);
  const chosen = lines.filter((l) => selected.includes(l.id));
  const total = chosen.reduce((sum, l) => sum + l.price * l.quantity, 0);
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));

  if (!lines.length) {
    return (
      <>
        <PageHeader title="Giỏ hàng" />
        <Empty>Giỏ hàng trống</Empty>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Giỏ hàng" />
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <Card className="hidden py-3 md:flex">
            <CardContent
              className={`${CART_COLS} text-sm text-muted-foreground`}
            >
              <span />
              <span>Sản phẩm</span>
              <span className="text-right">Đơn giá</span>
              <span className="text-center">Số lượng</span>
              <span className="text-right">Số tiền</span>
              <span className="text-center">Thao tác</span>
            </CardContent>
          </Card>
          {cart.data.shops.map((group) => (
            <Card key={group.shop.id}>
              <CardHeader>
                <CardTitle>
                  <Link to={`/shops/${group.shop.id}`}>{group.shop.name}</Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="divide-y">
                {group.items.map((line) => (
                  <div key={line.id} className={`${CART_COLS} py-3`}>
                    <Checkbox
                      disabled={!line.purchasable}
                      checked={selected.includes(line.id)}
                      onCheckedChange={(on) => toggle(line.id, on === true)}
                    />
                    <div className="flex min-w-48 flex-1 items-center gap-3">
                      <ItemImage src={line.image} className="size-16" />
                      <div className="min-w-0">
                        <Link
                          to={`/items/${line.itemId}`}
                          className="font-medium"
                        >
                          {line.itemName}
                        </Link>
                        {line.variation && (
                          <p className="text-sm text-muted-foreground">
                            {line.variation}
                          </p>
                        )}
                        {!line.purchasable && (
                          <Badge variant="destructive">Không thể mua</Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p>{money(line.price)}</p>
                      {line.priceChange !== 0 && (
                        <p className="text-xs text-muted-foreground line-through">
                          {money(line.addedPrice)}
                        </p>
                      )}
                    </div>
                    <div className="grid justify-items-center gap-1 text-xs">
                      <QuantityInput
                        value={line.quantity}
                        max={line.stock}
                        disabled={
                          line.stock === 0 ||
                          (update.isPending && update.variables.id === line.id)
                        }
                        onChange={(quantity) =>
                          update.mutate({ id: line.id, quantity })
                        }
                      />
                      <StockLabel stock={line.stock} />
                    </div>
                    <p className="text-right font-medium text-primary">
                      {money(line.price * line.quantity)}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove.mutate(line.id)}
                    >
                      Xóa
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle>Tóm tắt</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {chosen.length ? (
              chosen.map((l) => (
                <div key={l.id} className="flex justify-between gap-3">
                  <span className="min-w-0">
                    <span className="line-clamp-1">{l.itemName}</span>
                    <span className="text-muted-foreground">
                      {l.variation && `${l.variation} `}× {l.quantity}
                    </span>
                  </span>
                  <span className="shrink-0">
                    {money(l.price * l.quantity)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">Chưa chọn sản phẩm</p>
            )}
            <Separator />
            <div className="flex items-baseline justify-between">
              <span>Tổng cộng</span>
              <span className="text-lg font-medium text-primary">
                {money(total)}
              </span>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full"
              disabled={!chosen.length}
              onClick={() =>
                navigate('/checkout', { state: { lineIds: selected } })
              }
            >
              Mua hàng
            </Button>
          </CardFooter>
        </Card>
      </div>
    </>
  );
}

type CheckoutLine = Pick<
  CartLine,
  'id' | 'itemName' | 'image' | 'variation' | 'price' | 'quantity'
> & { originalPrice: number | null };

interface Preview {
  shops: {
    shop: { id: string; name: string; freeship: boolean };
    itemsTotal: number;
    sellerDiscount: number;
    platformDiscount: number;
    shippingFee: number;
    shippingDiscount: number;
    total: number;
  }[];
  total: number;
  shippingVoucher: string | null;
}

const CHECKOUT_COLS =
  'flex flex-wrap items-center gap-4 md:grid md:grid-cols-[1fr_7rem_5rem_7rem]';

export function CheckoutPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // From the cart: lineIds. From a flash sale page: one flash sale line bought on its own.
  const state = useLocation().state as {
    lineIds?: string[];
    flash?: { id: string; quantity: number };
  } | null;
  const lineIds = state?.lineIds ?? [];
  const flash = state?.flash;
  const source = flash ? { flashSale: flash } : { cartItemIds: lineIds };
  const flashSale = useQuery({
    queryKey: ['flash-sale', flash?.id],
    queryFn: () => api<FlashSalePage>(`/flash-sales/${flash!.id}`),
    enabled: !!flash,
  });
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [addressId, setAddressId] = useState<string>();
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'online'>('cod');
  // One voucher code per slot: each shop, the platform and shipping.
  const [picked, setPicked] = useState<Record<string, string | undefined>>({});
  const cart = useCart();
  const addresses = useQuery({
    queryKey: ['addresses'],
    queryFn: () => api<Address[]>('/addresses'),
  });
  const chosenAddress =
    addressId ?? addresses.data?.find((a) => a.isDefault)?.id ?? '';
  const shopIds = flash
    ? flashSale.data
      ? [flashSale.data.shop.id]
      : []
    : (cart.data?.shops ?? [])
        .filter((g) => g.items.some((l) => lineIds.includes(l.id)))
        .map((g) => g.shop.id);
  const vouchers = useQuery({
    queryKey: ['vouchers', shopIds.join()],
    queryFn: () => api<Voucher[]>(`/vouchers?shopIds=${shopIds.join(',')}`),
    enabled: shopIds.length > 0,
  });
  const voucherCodes = Object.values(picked).filter((c): c is string => !!c);
  const preview = useQuery({
    queryKey: ['checkout-preview', chosenAddress, source, voucherCodes],
    queryFn: () =>
      api<Preview>('/checkout/preview', {
        method: 'POST',
        body: { ...source, addressId: chosenAddress, voucherCodes },
      }),
    enabled: !!chosenAddress && (!!flash || lineIds.length > 0),
    retry: false,
    placeholderData: keepPreviousData,
  });
  const pick = (slot: string) => (code?: string) =>
    setPicked((p) => ({ ...p, [slot]: code }));
  const ofType = (type: Voucher['type'], shopId?: string) =>
    (vouchers.data ?? []).filter(
      (v) => v.type === type && (!shopId || v.shopId === shopId),
    );
  const place_ = useMutation({
    mutationFn: () =>
      api<{ checkoutId: string; orders: Order[] }>('/checkout', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: {
          ...source,
          addressId: chosenAddress,
          paymentMethod,
          voucherCodes,
          expectedTotal: preview.data?.total,
        },
      }),
    onError: (error) => {
      // The server priced the order differently from what is on screen: show the new prices.
      if (error instanceof ApiError && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: ['cart'] });
        void queryClient.invalidateQueries({ queryKey: ['checkout-preview'] });
        void queryClient.invalidateQueries({ queryKey: ['flash-sale'] });
      }
    },
    onSuccess: (data) => {
      toast.success('Đặt hàng thành công');
      void queryClient.invalidateQueries({ queryKey: ['cart'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['flash-sale'] });
      navigate(
        data.orders[0]?.status === 'unpaid'
          ? `/checkouts/${data.checkoutId}/payment`
          : '/orders',
        { replace: true },
      );
    },
  });

  if (!lineIds.length && !flash) return <Empty>Chưa chọn sản phẩm</Empty>;
  if (cart.isPending || addresses.isPending || (flash && flashSale.isPending)) {
    return <Loading />;
  }
  if (cart.error) return <ErrorMessage error={cart.error} />;
  if (addresses.error) return <ErrorMessage error={addresses.error} />;
  if (flashSale.error) return <ErrorMessage error={flashSale.error} />;
  const groups: {
    shop: { id: string; name: string };
    items: CheckoutLine[];
  }[] =
    flash && flashSale.data
      ? [
          {
            shop: flashSale.data.shop,
            items: [
              {
                id: flashSale.data.id,
                itemName: flashSale.data.itemName,
                image: flashSale.data.image,
                variation: flashSale.data.variation,
                price: flashSale.data.price,
                originalPrice: flashSale.data.originalPrice,
                quantity: flash.quantity,
              },
            ],
          },
        ]
      : cart.data.shops
          .map((g) => ({
            shop: g.shop,
            items: g.items
              .filter((l) => lineIds.includes(l.id))
              .map((l) => ({ ...l, originalPrice: null })),
          }))
          .filter((g) => g.items.length);
  const itemsTotal = groups
    .flatMap((g) => g.items)
    .reduce((sum, l) => sum + l.price * l.quantity, 0);
  const sum = (key: keyof Omit<Preview['shops'][number], 'shop'>) =>
    preview.data?.shops.reduce((n, x) => n + x[key], 0) ?? 0;
  // Minimum spends follow the server: platform after shop vouchers, shipping after both.
  const platformBase = itemsTotal - sum('sellerDiscount');
  const summary: [string, number, boolean][] = [
    ['Tiền hàng', preview.data ? sum('itemsTotal') : itemsTotal, false],
    ['Voucher của shop', sum('sellerDiscount'), true],
    ['Voucher sàn', sum('platformDiscount'), true],
    ['Phí vận chuyển', sum('shippingFee'), false],
    ['Giảm phí vận chuyển', sum('shippingDiscount'), true],
  ];

  return (
    <>
      <PageHeader title="Thanh toán" />
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="size-4 text-primary" />
                Địa chỉ nhận hàng
              </CardTitle>
            </CardHeader>
            <CardContent>
              {addresses.data.length ? (
                <RadioGroup value={chosenAddress} onValueChange={setAddressId}>
                  {addresses.data.map((a) => (
                    <Label
                      key={a.id}
                      className="flex items-start gap-3 rounded-md border p-3 font-normal has-data-[state=checked]:border-primary"
                    >
                      <RadioGroupItem value={a.id} className="mt-0.5" />
                      <span className="grid gap-1">
                        <span>
                          <span className="font-medium">{a.recipientName}</span>
                          <span className="text-muted-foreground">
                            {' '}
                            · {phone(a.phone)}
                          </span>
                          {a.isDefault && (
                            <Badge variant="outline" className="ml-2">
                              Mặc định
                            </Badge>
                          )}
                        </span>
                        <span className="text-muted-foreground">
                          {place(a.street, a)}
                        </span>
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
              ) : (
                <Button asChild variant="outline">
                  <Link to="/account/addresses">Thêm địa chỉ</Link>
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="hidden py-3 md:flex">
            <CardContent
              className={`${CHECKOUT_COLS} text-sm text-muted-foreground`}
            >
              <span>Sản phẩm</span>
              <span className="text-right">Đơn giá</span>
              <span className="text-center">Số lượng</span>
              <span className="text-right">Thành tiền</span>
            </CardContent>
          </Card>

          {groups.map((group) => (
            <Card key={group.shop.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Store className="size-4 text-muted-foreground" />
                  {group.shop.name}
                  {preview.data?.shops.find((x) => x.shop.id === group.shop.id)
                    ?.shop.freeship && (
                    <Badge variant="outline">Freeship</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="divide-y">
                {group.items.map((line) => (
                  <div key={line.id} className={`${CHECKOUT_COLS} py-3`}>
                    <div className="flex min-w-48 flex-1 items-center gap-3">
                      <ItemImage src={line.image} className="size-16" />
                      <div className="min-w-0">
                        <p className="line-clamp-2 font-medium">
                          {line.itemName}
                        </p>
                        {line.variation && (
                          <p className="text-sm text-muted-foreground">
                            {line.variation}
                          </p>
                        )}
                      </div>
                    </div>
                    <SalePrice
                      className="text-right"
                      price={line.price}
                      originalPrice={line.originalPrice}
                    />
                    <p className="text-center">{line.quantity}</p>
                    <p className="text-right font-medium">
                      {money(line.price * line.quantity)}
                    </p>
                  </div>
                ))}
              </CardContent>
              <CardFooter className="flex-wrap justify-end gap-x-2 gap-y-3 text-sm">
                <div className="w-full sm:max-w-sm sm:flex-1">
                  <VoucherPicker
                    label="Voucher của shop"
                    vouchers={ofType('shop_voucher', group.shop.id)}
                    base={group.items.reduce(
                      (n, l) => n + l.price * l.quantity,
                      0,
                    )}
                    discount={
                      preview.data?.shops.find(
                        (x) => x.shop.id === group.shop.id,
                      )?.sellerDiscount ?? 0
                    }
                    value={picked[`shop:${group.shop.id}`]}
                    onChange={pick(`shop:${group.shop.id}`)}
                  />
                </div>
                <span className="ml-auto text-muted-foreground">
                  Tổng ({group.items.reduce((n, l) => n + l.quantity, 0)} sản
                  phẩm)
                </span>
                <span className="font-medium">
                  {money(
                    group.items.reduce((n, l) => n + l.price * l.quantity, 0),
                  )}
                </span>
              </CardFooter>
            </Card>
          ))}
        </div>

        <Card className="lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle>Phương thức thanh toán</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <RadioGroup
              value={paymentMethod}
              onValueChange={(v) => setPaymentMethod(v as 'cod' | 'online')}
            >
              {(['cod', 'online'] as const).map((m) => (
                <Label
                  key={m}
                  className="flex items-center gap-3 rounded-md border p-3 font-normal has-data-[state=checked]:border-primary"
                >
                  <RadioGroupItem value={m} />
                  {PAYMENT_METHOD[m]}
                </Label>
              ))}
            </RadioGroup>
            <VoucherPicker
              label="Voucher sàn"
              vouchers={ofType('platform_voucher')}
              base={platformBase}
              discount={sum('platformDiscount')}
              value={picked.platform}
              onChange={pick('platform')}
            />
            {/* Free shipping is applied by the server for shops in the Freeship program. */}
            <VoucherPicker
              label="Mã miễn phí vận chuyển"
              vouchers={[]}
              base={0}
              discount={0}
              onChange={() => {}}
              locked={
                !preview.data?.shops.some((x) => x.shop.freeship)
                  ? 'Shop chưa tham gia Freeship'
                  : preview.data.shippingVoucher
                    ? `${preview.data.shippingVoucher} · -${money(sum('shippingDiscount'))}`
                    : 'Không có mã phù hợp'
              }
            />
            <Separator />
            <div className="grid gap-2">
              {summary
                .filter(([, amount, discount]) => !discount || amount > 0)
                .map(([label, amount, discount]) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="tabular-nums">
                      {discount ? `-${money(amount)}` : money(amount)}
                    </span>
                  </div>
                ))}
            </div>
            {preview.data && (
              <div className="flex items-baseline justify-between">
                <span>Tổng thanh toán</span>
                <span className="text-xl font-medium text-primary tabular-nums">
                  {money(preview.data.total)}
                </span>
              </div>
            )}
            {preview.error && <ErrorMessage error={preview.error} />}
            {place_.error &&
              (place_.error.message.startsWith('Prices changed') ? (
                <p className="text-sm text-destructive">
                  Giá đã thay đổi, vui lòng kiểm tra lại đơn hàng
                </p>
              ) : (
                <ErrorMessage error={place_.error} />
              ))}
          </CardContent>
          <CardFooter>
            <Button
              className="w-full"
              disabled={
                !chosenAddress ||
                !preview.data ||
                !!preview.error ||
                preview.isFetching ||
                place_.isPending
              }
              onClick={() => place_.mutate()}
            >
              Đặt hàng
            </Button>
          </CardFooter>
        </Card>
      </div>
    </>
  );
}

const ORDER_TABS: (OrderStatus | 'all')[] = [
  'all',
  'unpaid',
  'to_ship',
  'shipping',
  'delivered',
  'completed',
  'cancelled',
  'returned',
];

export function CancelOrderDialog({
  orderId,
  open,
  onOpenChange,
}: {
  orderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<CancelReason>();
  const [note, setNote] = useState('');
  const cancel = useMutation({
    mutationFn: () =>
      api<Order>(`/orders/${orderId}/cancel`, {
        method: 'POST',
        body: reason === 'other' ? { reason, note } : { reason },
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['order', orderId], data);
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      onOpenChange(false);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) {
          setReason(undefined);
          setNote('');
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lý do hủy đơn</DialogTitle>
        </DialogHeader>
        <RadioGroup
          value={reason ?? ''}
          onValueChange={(v) => setReason(v as CancelReason)}
        >
          {(Object.keys(CANCEL_REASON) as CancelReason[]).map((r) => (
            <Label
              key={r}
              className="flex items-center gap-3 rounded-md border p-3 font-normal has-data-[state=checked]:border-primary"
            >
              <RadioGroupItem value={r} />
              {CANCEL_REASON[r]}
            </Label>
          ))}
        </RadioGroup>
        {reason === 'other' && (
          <Textarea
            aria-label="Lý do khác"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Không hủy</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={
              !reason ||
              (reason === 'other' && !note.trim()) ||
              cancel.isPending
            }
            onClick={() => cancel.mutate()}
          >
            Hủy đơn
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// The buyer asks for a return with a reason; the seller refuses with a note for the admin.
function ReturnDialog({
  orderId,
  mode,
  open,
  onOpenChange,
}: {
  orderId: string;
  mode: 'request' | 'reject';
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<ReturnReason>();
  const [note, setNote] = useState('');
  const send = useMutation({
    mutationFn: () =>
      api<Order>(
        mode === 'request'
          ? `/orders/${orderId}/return`
          : `/orders/${orderId}/return/reject`,
        {
          method: 'POST',
          body:
            mode === 'request'
              ? { reason, ...(note.trim() && { note }) }
              : { note },
        },
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(['order', orderId], data);
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      onOpenChange(false);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) {
          setReason(undefined);
          setNote('');
          send.reset();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'request' ? 'Trả hàng/Hoàn tiền' : 'Từ chối trả hàng'}
          </DialogTitle>
        </DialogHeader>
        {mode === 'request' && (
          <RadioGroup
            value={reason ?? ''}
            onValueChange={(v) => setReason(v as ReturnReason)}
          >
            {(Object.keys(RETURN_REASON) as ReturnReason[]).map((r) => (
              <Label
                key={r}
                className="flex items-center gap-3 rounded-md border p-3 font-normal has-data-[state=checked]:border-primary"
              >
                <RadioGroupItem value={r} />
                {RETURN_REASON[r]}
              </Label>
            ))}
          </RadioGroup>
        )}
        <Textarea
          aria-label={mode === 'request' ? 'Mô tả' : 'Lý do từ chối'}
          placeholder={mode === 'request' ? 'Mô tả' : 'Lý do từ chối'}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {send.error && <ErrorMessage error={send.error} />}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Đóng</Button>
          </DialogClose>
          <Button
            disabled={
              (mode === 'request' ? !reason : !note.trim()) || send.isPending
            }
            onClick={() => send.mutate()}
          >
            Gửi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// What the shop will be paid for this order, mirroring the settlement: commission on the items after
// the shop's own voucher, and the Freeship fee fixed at checkout.
function PrepareOrderDialog({
  order,
  open,
  onOpenChange,
  onConfirm,
  pending,
}: {
  order: Order;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  const fees = useFees();
  const revenue = order.itemsTotal - order.sellerDiscount;
  const bps = fees.data?.commissionBps ?? 0;
  const commission = Math.round((revenue * bps) / 10_000);
  const rows: [string, number][] = [
    ['Tiền hàng', order.itemsTotal],
    ...(order.sellerDiscount
      ? [['Voucher shop', -order.sellerDiscount] as [string, number]]
      : []),
    [`Phí sàn (${bps / 100}%)`, -commission],
    ...(order.freeshipFee
      ? [['Phí Freeship', -order.freeshipFee] as [string, number]]
      : []),
  ];
  const steps = [
    'Chuẩn bị hàng',
    'Đơn vị vận chuyển lấy hàng',
    'Giao thành công',
    'Đơn hoàn thành, tiền vào ví',
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Chuẩn bị hàng</DialogTitle>
        </DialogHeader>
        {fees.isPending ? (
          <Loading />
        ) : (
          <dl className="grid gap-1.5 rounded-md border p-3 text-sm">
            {rows.map(([label, value]) => (
              <div
                key={label}
                className="flex justify-between text-muted-foreground"
              >
                <dt>{label}</dt>
                <dd className="tabular-nums">{money(value)}</dd>
              </div>
            ))}
            <Separator className="my-1" />
            <div className="flex justify-between font-medium">
              <dt>Dự kiến nhận</dt>
              <dd className="text-primary tabular-nums">
                {money(revenue - commission - order.freeshipFee)}
              </dd>
            </div>
          </dl>
        )}
        <ol className="grid gap-2 text-sm">
          {steps.map((label, i) => (
            <li key={label} className="flex items-center gap-2">
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-medium ${i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
              >
                {i + 1}
              </span>
              {label}
            </li>
          ))}
        </ol>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Hủy</Button>
          </DialogClose>
          <Button disabled={pending || fees.isPending} onClick={onConfirm}>
            <PackageCheck />
            Xác nhận chuẩn bị hàng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OrderTable({ party }: { party: 'buyer' | 'seller' }) {
  const queryClient = useQueryClient();
  const basePath = party === 'buyer' ? '/orders' : '/shops/me/orders';
  const linkPrefix = party === 'buyer' ? '/orders' : '/seller/orders';
  const [status, setStatus] = useState<OrderStatus | 'all'>('all');
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [prepareId, setPrepareId] = useState<string | null>(null);
  const path = status === 'all' ? basePath : `${basePath}?status=${status}`;
  const page = usePaged<Order>(['orders', basePath, status], path);
  const act = useMutation({
    mutationFn: ({
      id,
      path,
      body,
    }: {
      id: string;
      path: 'ship' | 'receive';
      body?: object;
    }) => api<Order>(`/orders/${id}/${path}`, { method: 'POST', body }),
    onSuccess: (data) => {
      queryClient.setQueryData(['order', data.id], data);
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        {ORDER_TABS.map((t) => (
          <Button
            key={t}
            size="sm"
            variant={status === t ? 'default' : 'outline'}
            onClick={() => setStatus(t)}
          >
            {t === 'all' ? 'Tất cả' : ORDER_STATUS[t]}
          </Button>
        ))}
      </div>
      {page.isPending ? (
        <Loading />
      ) : page.error ? (
        <ErrorMessage error={page.error} />
      ) : !page.items.length ? (
        <Empty>Chưa có đơn hàng</Empty>
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã đơn</TableHead>
                  <TableHead>Sản phẩm</TableHead>
                  <TableHead className="text-center">Số lượng</TableHead>
                  <TableHead className="text-right">Tổng tiền</TableHead>
                  <TableHead>Thanh toán</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.items.map((o) => {
                  const cancellable =
                    party === 'buyer' &&
                    (o.status === 'unpaid' ||
                      (o.status === 'to_ship' && !o.shipment));
                  return (
                    <TableRow key={o.id} className="align-top">
                      <TableCell>
                        <p className="font-mono font-medium">
                          {o.id.slice(-8).toUpperCase()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {dateTime(o.createdAt)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {party === 'buyer'
                            ? o.shop.name
                            : `${o.shippingAddress.recipientName} · ${o.shippingAddress.province.name}`}
                        </p>
                      </TableCell>
                      <TableCell className="min-w-64">
                        <div className="grid gap-2">
                          {o.items.map((i) => (
                            <div
                              key={i.id}
                              className="flex h-12 items-center gap-3"
                            >
                              <ItemImage src={i.image} className="size-12" />
                              <div className="min-w-0">
                                <p className="line-clamp-1">{i.itemName}</p>
                                {i.modelName && (
                                  <p className="text-xs text-muted-foreground">
                                    {i.modelName}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="grid gap-2">
                          {o.items.map((i) => (
                            <span
                              key={i.id}
                              className="flex h-12 items-center justify-center tabular-nums"
                            >
                              {i.quantity}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium text-primary tabular-nums">
                        {money(o.total)}
                      </TableCell>
                      <TableCell>
                        <p>{PAYMENT_METHOD[o.paymentMethod]}</p>
                        <p className="text-xs text-muted-foreground">
                          {PAYMENT_STATE[o.paymentState]}
                        </p>
                      </TableCell>
                      <TableCell>
                        <OrderStatusBadge status={o.status} />
                      </TableCell>
                      <TableCell>
                        <div className="ml-auto grid w-44 gap-2 *:w-full">
                          {party === 'seller' &&
                            o.status === 'to_ship' &&
                            !o.shipment && (
                              <Button
                                size="sm"
                                onClick={() => setPrepareId(o.id)}
                              >
                                <PackageCheck />
                                Chuẩn bị hàng
                              </Button>
                            )}
                          {party === 'buyer' &&
                            o.status === 'delivered' &&
                            !openReturn(o) && (
                              <Button
                                size="sm"
                                disabled={act.isPending}
                                onClick={() =>
                                  act.mutate({ id: o.id, path: 'receive' })
                                }
                              >
                                <PackageCheck />
                                Đã nhận được hàng
                              </Button>
                            )}
                          {cancellable && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCancelId(o.id)}
                            >
                              Hủy đơn
                            </Button>
                          )}
                          <Button asChild variant="outline" size="sm">
                            <Link to={`${linkPrefix}/${o.id}`}>
                              Xem chi tiết
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <Pager page={page.page} prev={page.prev} next={page.next} />
      {(() => {
        const prepare = page.items.find((o) => o.id === prepareId);
        return (
          prepare && (
            <PrepareOrderDialog
              order={prepare}
              open
              onOpenChange={(open) => !open && setPrepareId(null)}
              pending={act.isPending}
              onConfirm={() =>
                act.mutate(
                  { id: prepare.id, path: 'ship' },
                  { onSuccess: () => setPrepareId(null) },
                )
              }
            />
          )
        );
      })()}
      {cancelId && (
        <CancelOrderDialog
          orderId={cancelId}
          open
          onOpenChange={(open) => !open && setCancelId(null)}
        />
      )}
    </>
  );
}

export function OrdersPage() {
  return (
    <>
      <PageHeader title="Đơn mua" />
      <OrderTable party="buyer" />
    </>
  );
}

export function OrderDetail({
  backTo,
  viewer,
  actions,
  links,
}: {
  backTo: string;
  viewer: 'buyer' | 'seller';
  links?: (order: Order) => { label: string; to: string }[];
  actions: (order: Order) => {
    label: string;
    path: string;
    body?: object;
    variant?: 'default' | 'outline' | 'destructive';
    dialog?: 'cancel' | 'request' | 'reject' | 'prepare';
  }[];
}) {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const order = useQuery({
    queryKey: ['order', id],
    queryFn: () => api<Order>(`/orders/${id}`),
  });
  const [dialog, setDialog] = useState<
    'cancel' | 'request' | 'reject' | 'prepare'
  >();
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: object }) =>
      api<Order>(`/orders/${id}/${path}`, { method: 'POST', body }),
    onSuccess: (data) => {
      queryClient.setQueryData(['order', id], data);
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  if (order.isPending) return <Loading />;
  if (order.error) return <ErrorMessage error={order.error} />;
  const o = order.data;
  const a = o.shippingAddress;

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link to={backTo}>
          <ChevronLeft />
          Quay lại
        </Link>
      </Button>
      <PageHeader
        title={`Đơn hàng ${o.id.slice(-8).toUpperCase()}`}
        actions={[
          ...(links?.(o) ?? []).map((x) => (
            <Button key={x.to} asChild>
              <Link to={x.to}>{x.label}</Link>
            </Button>
          )),
          ...actions(o).map((x) => (
            <Button
              key={x.path}
              variant={x.variant ?? 'default'}
              disabled={act.isPending}
              onClick={() =>
                x.dialog
                  ? setDialog(x.dialog)
                  : act.mutate({ path: x.path, body: x.body })
              }
            >
              {x.label}
            </Button>
          )),
        ]}
      />
      <CancelOrderDialog
        orderId={o.id}
        open={dialog === 'cancel'}
        onOpenChange={(open) => setDialog(open ? 'cancel' : undefined)}
      />
      <PrepareOrderDialog
        order={o}
        open={dialog === 'prepare'}
        onOpenChange={(open) => setDialog(open ? 'prepare' : undefined)}
        pending={act.isPending}
        onConfirm={() =>
          act.mutate(
            { path: 'ship' },
            { onSuccess: () => setDialog(undefined) },
          )
        }
      />
      {(dialog === 'request' || dialog === 'reject') && (
        <ReturnDialog
          orderId={o.id}
          mode={dialog}
          open
          onOpenChange={(open) => !open && setDialog(undefined)}
        />
      )}
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="size-4 text-muted-foreground" />
                {o.shop.name}
              </CardTitle>
              <CardAction>
                <OrderStatusBadge status={o.status} />
              </CardAction>
            </CardHeader>
            <CardContent>
              <Table fit={false}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sản phẩm</TableHead>
                    <TableHead className="text-right">Đơn giá</TableHead>
                    <TableHead className="text-center">Số lượng</TableHead>
                    <TableHead className="text-right">Thành tiền</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {o.items.map((i) => (
                    <Fragment key={i.id}>
                      <TableRow>
                        <TableCell className="min-w-64">
                          <div className="flex items-center gap-3">
                            <ItemImage src={i.image} className="size-14" />
                            <div className="min-w-0">
                              <p className="line-clamp-2 font-medium">
                                {i.itemName}
                              </p>
                              {i.modelName && (
                                <p className="text-xs text-muted-foreground">
                                  {i.modelName}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <SalePrice
                            price={i.price}
                            originalPrice={i.originalPrice}
                          />
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {i.quantity}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {money(i.price * i.quantity)}
                        </TableCell>
                      </TableRow>
                      {(i.review ||
                        (viewer === 'buyer' && o.status === 'completed')) && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={4} className="whitespace-normal">
                            <LineReview order={o} line={i} viewer={viewer} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="size-4 text-primary" />
                Địa chỉ nhận hàng
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AddressBlock
                name={a.recipientName}
                phone={a.phone}
                street={a.street}
                location={a}
              />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:sticky lg:top-20">
          <Card>
            <CardHeader>
              <CardTitle>Thanh toán</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phương thức</span>
                <span>{PAYMENT_METHOD[o.paymentMethod]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Trạng thái</span>
                <span>{PAYMENT_STATE[o.paymentState]}</span>
              </div>
              {(
                [
                  ['Tiền hàng', o.itemsTotal, false],
                  ['Voucher của shop', o.sellerDiscount, true],
                  ['Voucher sàn', o.platformDiscount, true],
                  ['Phí vận chuyển', o.shippingFee, false],
                  ['Giảm phí vận chuyển', o.shippingDiscount, true],
                ] as const
              )
                .filter(([, amount, discount]) => !discount || amount > 0)
                .map(([label, amount, discount]) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="tabular-nums">
                      {discount ? `-${money(amount)}` : money(amount)}
                    </span>
                  </div>
                ))}
              {o.vouchers.length > 0 && (
                <div className="grid gap-2 rounded-md border border-dashed p-3">
                  {o.vouchers.map((v) => (
                    <div key={v.code} className="flex justify-between gap-3">
                      <span className="grid min-w-0">
                        <span className="flex items-center gap-1.5">
                          <TicketPercent className="size-3.5 text-primary" />
                          <span className="font-mono">{v.code}</span>
                          <span className="text-xs text-muted-foreground">
                            {VOUCHER_TYPE[v.type]}
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {v.name} · {voucherTerms(v)}
                        </span>
                      </span>
                      <span className="tabular-nums">-{money(v.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
              <Separator />
              <div className="flex items-baseline justify-between">
                <span>Tổng cộng</span>
                <span className="text-lg font-medium text-primary">
                  {money(o.total)}
                </span>
              </div>
            </CardContent>
          </Card>
          {o.returnRequest && (
            <Card>
              <CardHeader>
                <CardTitle>Trả hàng/Hoàn tiền</CardTitle>
                <CardAction>
                  <Badge variant="outline">
                    {RETURN_STATUS[o.returnRequest.status]}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                <p>{RETURN_REASON[o.returnRequest.reason]}</p>
                {o.returnRequest.note && (
                  <p className="text-muted-foreground">
                    {o.returnRequest.note}
                  </p>
                )}
                {o.returnRequest.sellerNote && (
                  <p>
                    <span className="text-muted-foreground">Người bán: </span>
                    {o.returnRequest.sellerNote}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {dateTime(o.returnRequest.createdAt)}
                </p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Lịch sử</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-3 border-l pl-4 text-sm">
                {o.history.map((h) => (
                  <li key={h.at + h.to} className="relative">
                    <span className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-primary" />
                    <p>{ORDER_STATUS[h.to]}</p>
                    {h.to === 'cancelled' && o.cancelReason && (
                      <p className="text-muted-foreground">
                        {o.cancelNote ?? CANCEL_REASON[o.cancelReason]}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {dateTime(h.at)}
                    </p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

const RETURN_WINDOW_MS = 15 * 24 * 60 * 60 * 1000;

const openReturn = (o: Order) =>
  o.returnRequest?.status === 'requested' ||
  o.returnRequest?.status === 'disputed';

const canRequestReturn = (o: Order) =>
  (o.status === 'delivered' || o.status === 'completed') &&
  !o.returnRequest &&
  !!o.shipment?.deliveredAt &&
  Date.now() - Date.parse(o.shipment.deliveredAt) <= RETURN_WINDOW_MS;

export function BuyerOrderPage() {
  return (
    <OrderDetail
      backTo="/orders"
      viewer="buyer"
      links={(o) =>
        o.status === 'unpaid'
          ? [{ label: 'Thanh toán', to: `/checkouts/${o.checkoutId}/payment` }]
          : []
      }
      actions={(o) => [
        ...(o.status === 'unpaid' || (o.status === 'to_ship' && !o.shipment)
          ? [
              {
                label: 'Hủy đơn',
                path: 'cancel',
                variant: 'outline' as const,
                dialog: 'cancel' as const,
              },
            ]
          : []),
        ...(o.status === 'delivered' && !openReturn(o)
          ? [{ label: 'Đã nhận được hàng', path: 'receive' }]
          : []),
        ...(canRequestReturn(o)
          ? [
              {
                label: 'Trả hàng/Hoàn tiền',
                path: 'return',
                variant: 'outline' as const,
                dialog: 'request' as const,
              },
            ]
          : []),
      ]}
    />
  );
}
