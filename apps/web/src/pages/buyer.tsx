import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  MapPin,
  PackageCheck,
  Store,
  UserRound,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import {
  AddressBlock,
  Empty,
  ErrorMessage,
  ItemImage,
  LoadMore,
  Loading,
  OrderStatusBadge,
  PageHeader,
  QuantityInput,
  StockLabel,
} from '@/components/common';
import { Badge } from '@/components/ui/badge';
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
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import {
  CANCEL_REASON,
  dateTime,
  money,
  ORDER_STATUS,
  PAYMENT_METHOD,
  phone,
  place,
  SHIPMENT_STATUS,
} from '@/lib/format';
import { useCart, usePaged } from '@/lib/queries';
import type {
  Address,
  CancelReason,
  Cart,
  Order,
  OrderStatus,
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
          <Card size="sm" className="hidden md:flex">
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
                      <ItemImage className="size-16" />
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

const CHECKOUT_COLS =
  'flex flex-wrap items-center gap-4 md:grid md:grid-cols-[1fr_7rem_5rem_7rem]';

export function CheckoutPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const lineIds =
    (useLocation().state as { lineIds?: string[] } | null)?.lineIds ?? [];
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [addressId, setAddressId] = useState<string>();
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'online'>('cod');
  const cart = useCart();
  const addresses = useQuery({
    queryKey: ['addresses'],
    queryFn: () => api<Address[]>('/addresses'),
  });
  const place_ = useMutation({
    mutationFn: () =>
      api<{ orders: Order[] }>('/checkout', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: {
          cartItemIds: lineIds,
          addressId: addressId ?? addresses.data?.find((a) => a.isDefault)?.id,
          paymentMethod,
        },
      }),
    onSuccess: () => {
      toast.success('Đặt hàng thành công');
      void queryClient.invalidateQueries({ queryKey: ['cart'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      navigate('/orders', { replace: true });
    },
  });

  if (!lineIds.length) return <Empty>Chưa chọn sản phẩm</Empty>;
  if (cart.isPending || addresses.isPending) return <Loading />;
  if (cart.error) return <ErrorMessage error={cart.error} />;
  if (addresses.error) return <ErrorMessage error={addresses.error} />;
  const groups = cart.data.shops
    .map((g) => ({
      ...g,
      items: g.items.filter((l) => lineIds.includes(l.id)),
    }))
    .filter((g) => g.items.length);
  const itemsTotal = groups
    .flatMap((g) => g.items)
    .reduce((sum, l) => sum + l.price * l.quantity, 0);
  const chosenAddress =
    addressId ?? addresses.data.find((a) => a.isDefault)?.id ?? '';

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

          <Card size="sm" className="hidden md:flex">
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
                </CardTitle>
              </CardHeader>
              <CardContent className="divide-y">
                {group.items.map((line) => (
                  <div key={line.id} className={`${CHECKOUT_COLS} py-3`}>
                    <div className="flex min-w-48 flex-1 items-center gap-3">
                      <ItemImage className="size-16" />
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
                    <p className="text-right">{money(line.price)}</p>
                    <p className="text-center">{line.quantity}</p>
                    <p className="text-right font-medium">
                      {money(line.price * line.quantity)}
                    </p>
                  </div>
                ))}
              </CardContent>
              <CardFooter className="justify-end gap-2 text-sm">
                <span className="text-muted-foreground">
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
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tiền hàng</span>
              <span>{money(itemsTotal)}</span>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full"
              disabled={!chosenAddress || place_.isPending}
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

const ORDER_COLS =
  'flex flex-wrap items-start gap-4 md:grid md:grid-cols-[1fr_8rem_8rem_8rem_10rem]';

export function OrderTable({ party }: { party: 'buyer' | 'seller' }) {
  const queryClient = useQueryClient();
  const basePath = party === 'buyer' ? '/orders' : '/shops/me/orders';
  const linkPrefix = party === 'buyer' ? '/orders' : '/account/seller/orders';
  const [status, setStatus] = useState<OrderStatus | 'all'>('all');
  const [cancelId, setCancelId] = useState<string | null>(null);
  const path = status === 'all' ? basePath : `${basePath}?status=${status}`;
  const page = usePaged<Order>(['orders', basePath, status], path);
  const act = useMutation({
    mutationFn: ({ id, path }: { id: string; path: 'ship' | 'receive' }) =>
      api<Order>(`/orders/${id}/${path}`, { method: 'POST' }),
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
        <div className="space-y-3">
          <Card size="sm" className="hidden md:flex">
            <CardContent
              className={`${ORDER_COLS} text-sm text-muted-foreground`}
            >
              <span>Sản phẩm</span>
              <span className="text-right">Tổng tiền</span>
              <span>Trạng thái</span>
              <span>Vận chuyển</span>
              <span className="text-right">Thao tác</span>
            </CardContent>
          </Card>
          {page.items.map((o) => {
            const cancellable =
              party === 'buyer' &&
              (o.status === 'unpaid' ||
                (o.status === 'to_ship' && !o.shipment));
            return (
              <Card key={o.id} className="gap-0 py-0">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-(--card-spacing) py-2.5 text-sm">
                  {party === 'buyer' ? (
                    <span className="flex items-center gap-2 font-medium">
                      <Store className="size-4 text-muted-foreground" />
                      {o.shop.name}
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <UserRound className="size-4 text-muted-foreground" />
                      <span className="font-medium">
                        {o.shippingAddress.recipientName}
                      </span>
                      <span className="text-muted-foreground">
                        · {o.shippingAddress.province.name}
                      </span>
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    Mã đơn{' '}
                    <span className="font-mono text-foreground">
                      {o.id.slice(-8).toUpperCase()}
                    </span>{' '}
                    · {dateTime(o.createdAt)}
                  </span>
                </div>
                <CardContent className={`${ORDER_COLS} py-4`}>
                  <div className="grid min-w-56 flex-1 gap-3">
                    {o.items.map((i) => (
                      <div key={i.modelId} className="flex items-center gap-3">
                        <ItemImage className="size-14" />
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-1">{i.itemName}</p>
                          {i.modelName && (
                            <p className="text-sm text-muted-foreground">
                              {i.modelName}
                            </p>
                          )}
                        </div>
                        <span className="text-sm text-muted-foreground">
                          × {i.quantity}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-primary tabular-nums">
                      {money(o.total)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {PAYMENT_METHOD[o.paymentMethod]}
                    </p>
                  </div>
                  <div>
                    <OrderStatusBadge status={o.status} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {o.shipment ? SHIPMENT_STATUS[o.shipment.status] : '—'}
                  </p>
                  <div className="flex flex-col items-end gap-2">
                    {party === 'seller' &&
                      o.status === 'to_ship' &&
                      !o.shipment && (
                        <Button
                          size="sm"
                          disabled={act.isPending}
                          onClick={() => act.mutate({ id: o.id, path: 'ship' })}
                        >
                          <PackageCheck />
                          Chuẩn bị hàng
                        </Button>
                      )}
                    {party === 'buyer' && o.status === 'delivered' && (
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
                        variant="ghost"
                        size="sm"
                        onClick={() => setCancelId(o.id)}
                      >
                        Hủy đơn
                      </Button>
                    )}
                    <Button asChild variant="outline" size="sm">
                      <Link to={`${linkPrefix}/${o.id}`}>Xem chi tiết</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <LoadMore
        hasMore={page.hasNextPage}
        loading={page.isFetchingNextPage}
        onClick={() => void page.fetchNextPage()}
      />
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
  actions,
}: {
  backTo: string;
  actions: (order: Order) => {
    label: string;
    path: string;
    variant?: 'default' | 'outline' | 'destructive';
    askReason?: boolean;
  }[];
}) {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const order = useQuery({
    queryKey: ['order', id],
    queryFn: () => api<Order>(`/orders/${id}`),
  });
  const [cancelling, setCancelling] = useState(false);
  const act = useMutation({
    mutationFn: (path: string) =>
      api<Order>(`/orders/${id}/${path}`, { method: 'POST' }),
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
        actions={actions(o).map((x) => (
          <Button
            key={x.path}
            variant={x.variant ?? 'default'}
            disabled={act.isPending}
            onClick={() =>
              x.askReason ? setCancelling(true) : act.mutate(x.path)
            }
          >
            {x.label}
          </Button>
        ))}
      />
      <CancelOrderDialog
        orderId={o.id}
        open={cancelling}
        onOpenChange={setCancelling}
      />
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <Card size="sm" className="hidden md:flex">
            <CardContent
              className={`${CHECKOUT_COLS} text-sm text-muted-foreground`}
            >
              <span>Sản phẩm</span>
              <span className="text-right">Đơn giá</span>
              <span className="text-center">Số lượng</span>
              <span className="text-right">Thành tiền</span>
            </CardContent>
          </Card>
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
            <CardContent className="divide-y">
              {o.items.map((i) => (
                <div key={i.modelId} className={`${CHECKOUT_COLS} py-3`}>
                  <div className="flex min-w-48 flex-1 items-center gap-3">
                    <ItemImage className="size-16" />
                    <div className="min-w-0">
                      <p className="line-clamp-2 font-medium">{i.itemName}</p>
                      {i.modelName && (
                        <p className="text-sm text-muted-foreground">
                          {i.modelName}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-right">{money(i.price)}</p>
                  <p className="text-center">{i.quantity}</p>
                  <p className="text-right font-medium">
                    {money(i.price * i.quantity)}
                  </p>
                </div>
              ))}
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
                <span className="text-muted-foreground">Tiền hàng</span>
                <span>{money(o.itemsTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phí vận chuyển</span>
                <span>{money(o.shippingFee)}</span>
              </div>
              <Separator />
              <div className="flex items-baseline justify-between">
                <span>Tổng cộng</span>
                <span className="text-lg font-medium text-primary">
                  {money(o.total)}
                </span>
              </div>
            </CardContent>
          </Card>
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

export function BuyerOrderPage() {
  return (
    <OrderDetail
      backTo="/orders"
      actions={(o) => [
        ...(o.status === 'unpaid' || (o.status === 'to_ship' && !o.shipment)
          ? [
              {
                label: 'Hủy đơn',
                path: 'cancel',
                variant: 'outline' as const,
                askReason: true,
              },
            ]
          : []),
        ...(o.status === 'delivered'
          ? [{ label: 'Đã nhận được hàng', path: 'receive' }]
          : []),
      ]}
    />
  );
}
