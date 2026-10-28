import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlignLeft,
  ChartColumn,
  Clock,
  Package,
  Pencil,
  ReceiptText,
  Store,
  Star,
  TicketPercent,
  Truck,
  Wallet,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { Navigate, NavLink, Outlet } from 'react-router';
import { toast } from 'sonner';
import {
  AddressBlock,
  ErrorMessage,
  Loading,
  PageHeader,
} from '@/components/common';
import { LocationFields } from '@/components/location-fields';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Field } from '@/pages/account';
import { api } from '@/lib/api';
import { dateTime, phone, SHOP_STATUS } from '@/lib/format';
import { useMyShop } from '@/lib/queries';
import { ShopReportSection, ShopWallet } from '@/pages/seller/other';
import type { MyShop, Shop, ShopAddress } from '@/lib/types';

const values = (e: React.SubmitEvent<HTMLFormElement>) =>
  Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;

function PickupFields({
  current,
  wardCode,
  onWardChange,
}: {
  current?: ShopAddress | null;
  wardCode: string;
  onWardChange: (code: string) => void;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Người liên hệ"
          name="contactName"
          defaultValue={current?.contactName}
          required
        />
        <Field
          label="Số điện thoại"
          name="phone"
          type="tel"
          defaultValue={current?.phone}
          required
        />
      </div>
      <LocationFields
        provinceCode={current?.province.code}
        wardCode={wardCode}
        onWardChange={onWardChange}
      />
      <Field
        label="Địa chỉ cụ thể"
        name="street"
        defaultValue={current?.street}
        required
      />
    </>
  );
}

function OpenShop() {
  const queryClient = useQueryClient();
  const [wardCode, setWardCode] = useState('');
  const open = useMutation({
    mutationFn: (body: Record<string, string>) =>
      api<MyShop>('/shops', { method: 'POST', body: { ...body, wardCode } }),
    onSuccess: (shop) => queryClient.setQueryData(['my-shop'], shop),
  });

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Mở cửa hàng</CardTitle>
      </CardHeader>
      <form
        className="contents"
        onSubmit={(e) => {
          e.preventDefault();
          open.mutate(values(e));
        }}
      >
        <CardContent className="grid gap-6">
          <section className="grid gap-4">
            <h3 className="text-sm font-medium text-muted-foreground">
              Thông tin cửa hàng
            </h3>
            <Field label="Tên cửa hàng" name="name" required />
            <div className="grid gap-2">
              <Label htmlFor="description">Mô tả</Label>
              <Textarea id="description" name="description" />
            </div>
          </section>
          <Separator />
          <section className="grid gap-4">
            <h3 className="text-sm font-medium text-muted-foreground">
              Địa chỉ lấy hàng
            </h3>
            <PickupFields wardCode={wardCode} onWardChange={setWardCode} />
          </section>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={!wardCode || open.isPending}>
            Mở cửa hàng
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

const TABS = [
  ['/seller', 'Tổng quan', ChartColumn],
  ['/seller/wallet', 'Ví', Wallet],
  ['/seller/profile', 'Cửa hàng', Store],
  ['/seller/items', 'Sản phẩm', Package],
  ['/seller/orders', 'Đơn hàng', ReceiptText],
  ['/seller/vouchers', 'Khuyến mãi', TicketPercent],
  ['/seller/flash-sales', 'Flash Sale', Zap],
  ['/seller/reviews', 'Đánh giá', Star],
] as const;

export function SellerLayout() {
  const shop = useMyShop();
  if (shop.isPending) return <Loading />;
  if (shop.error) return <ErrorMessage error={shop.error} />;
  // Until the admin approves the shop, it is opened and followed from the account pages.
  if (shop.data?.status !== 'active') {
    return <Navigate to="/account/shop" replace />;
  }
  return (
    <div className="grid gap-5 md:grid-cols-[13rem_1fr]">
      <nav className="flex flex-wrap gap-2 md:sticky md:top-20 md:flex-col md:self-start">
        {TABS.map(([to, label, Icon]) => (
          <Button
            asChild
            key={to}
            variant="outline"
            className="justify-start aria-[current=page]:border-primary aria-[current=page]:text-primary"
          >
            <NavLink to={to} end={to === '/seller'}>
              <Icon />
              {label}
            </NavLink>
          </Button>
        ))}
      </nav>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}

function Section({
  title,
  editing,
  onEdit,
  children,
}: {
  title: string;
  editing: boolean;
  onEdit?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="grid content-start gap-4">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        {!editing && onEdit && (
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil />
            Sửa
          </Button>
        )}
      </div>
      {children}
    </section>
  );
}

function EditActions({
  pending,
  disabled,
  onCancel,
}: {
  pending: boolean;
  disabled?: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button
        type="button"
        variant="ghost"
        disabled={pending}
        onClick={onCancel}
      >
        Hủy
      </Button>
      <Button type="submit" disabled={disabled || pending}>
        Lưu
      </Button>
    </div>
  );
}

function ShopInfo({ shop }: { shop: MyShop }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const save = useMutation({
    mutationFn: (f: Record<string, string>) =>
      api<MyShop>('/shops/me', {
        method: 'PATCH',
        body: { name: f.name, description: f.description || null },
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['my-shop'], data);
      setEditing(false);
      toast.success('Đã cập nhật');
    },
  });
  const icon = 'mt-0.5 size-4 shrink-0 text-muted-foreground';

  return (
    <Section
      title="Thông tin cửa hàng"
      editing={editing}
      onEdit={shop.status === 'banned' ? undefined : () => setEditing(true)}
    >
      {!editing ? (
        <div className="grid gap-3 text-sm">
          <p className="flex gap-3">
            <Store className={icon} />
            <span className="font-medium">{shop.name}</span>
          </p>
          <p className="flex gap-3">
            <AlignLeft className={icon} />
            <span className="whitespace-pre-line text-muted-foreground">
              {shop.description || 'Chưa có mô tả'}
            </span>
          </p>
        </div>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(values(e));
          }}
        >
          <Field
            label="Tên cửa hàng"
            name="name"
            defaultValue={shop.name}
            required
          />
          <div className="grid gap-2">
            <Label htmlFor="description">Mô tả</Label>
            <Textarea
              id="description"
              name="description"
              rows={5}
              defaultValue={shop.description ?? ''}
            />
          </div>
          <EditActions
            pending={save.isPending}
            onCancel={() => setEditing(false)}
          />
        </form>
      )}
    </Section>
  );
}

function ShopAddress({ shop }: { shop: MyShop }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [wardCode, setWardCode] = useState('');
  const save = useMutation({
    mutationFn: (f: Record<string, string>) =>
      api<MyShop>('/shops/me/address', {
        method: 'PUT',
        body: { ...f, wardCode },
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['my-shop'], data);
      setEditing(false);
      toast.success('Đã cập nhật');
    },
  });

  return (
    <Section
      title="Địa chỉ lấy hàng"
      editing={editing}
      onEdit={
        shop.status === 'banned'
          ? undefined
          : () => {
              setWardCode(shop.ward.code);
              setEditing(true);
            }
      }
    >
      {!editing ? (
        <AddressBlock
          name={shop.contactName}
          phone={shop.phone}
          street={shop.street}
          location={shop}
        />
      ) : (
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(values(e));
          }}
        >
          <PickupFields
            current={{ ...shop, phone: phone(shop.phone) }}
            wardCode={wardCode}
            onWardChange={setWardCode}
          />
          <EditActions
            pending={save.isPending}
            disabled={!wardCode}
            onCancel={() => setEditing(false)}
          />
        </form>
      )}
    </Section>
  );
}

function ShopProfile({ shop }: { shop: MyShop }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Hồ sơ cửa hàng</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <ShopInfo shop={shop} />
        <div className="md:border-l md:pl-6">
          <ShopAddress shop={shop} />
        </div>
      </CardContent>
    </Card>
  );
}

const SHOP_NOTICE: Record<Shop['status'], string> = {
  pending: 'Cửa hàng đang chờ duyệt',
  active: '',
  rejected: 'Cửa hàng bị từ chối',
  banned: 'Cửa hàng bị khóa',
};

export function SellerShopPage() {
  const shop = useMyShop();
  if (!shop.data) return null;
  const s = shop.data;

  return (
    <>
      <PageHeader
        title={s.name}
        actions={
          <Badge variant={s.status === 'active' ? 'default' : 'secondary'}>
            {SHOP_STATUS[s.status]}
          </Badge>
        }
      />
      {s.status !== 'active' && (
        <Alert className="mb-4">
          <Clock />
          <AlertTitle>{SHOP_NOTICE[s.status]}</AlertTitle>
          {s.statusReason && (
            <AlertDescription className="whitespace-pre-line">
              {s.statusReason}
            </AlertDescription>
          )}
        </Alert>
      )}
      <div className="grid gap-4">
        <ShopProfile shop={s} />
        {s.status === 'active' && <FreeshipProgram shop={s} />}
      </div>
    </>
  );
}

// Assumption: mirrors FREESHIP_FEE_BPS and FREESHIP_FEE_CAP in the API's pricing.
const FREESHIP_TERMS = 'Phí 6% doanh thu mỗi đơn, tối đa 50.000₫/đơn';

function FreeshipProgram({ shop }: { shop: MyShop }) {
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      api<MyShop>('/shops/me/freeship', { method: 'PUT', body: { enabled } }),
    onSuccess: (data) => {
      queryClient.setQueryData(['my-shop'], data);
      toast.success(
        data.freeshipRequestedAt
          ? 'Đã gửi yêu cầu tham gia'
          : shop.freeshipRequestedAt
            ? 'Đã hủy yêu cầu'
            : 'Đã rời chương trình',
      );
    },
  });
  const [badge, action, next] = shop.freeship
    ? (['Đang tham gia', 'Rời chương trình', false] as const)
    : shop.freeshipRequestedAt
      ? (['Chờ duyệt', 'Hủy yêu cầu', false] as const)
      : ([null, 'Gửi yêu cầu tham gia', true] as const);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="size-4 text-primary" />
          Chương trình Freeship
          {badge && (
            <Badge variant={shop.freeship ? 'default' : 'secondary'}>
              {badge}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          {FREESHIP_TERMS}
          {shop.freeshipRequestedAt &&
            ` · Gửi lúc ${dateTime(shop.freeshipRequestedAt)}`}
        </span>
        <Button
          variant={next ? 'default' : 'outline'}
          disabled={toggle.isPending}
          onClick={() => toggle.mutate(next)}
        >
          {action}
        </Button>
      </CardContent>
      {toggle.error && (
        <CardContent>
          <ErrorMessage error={toggle.error} />
        </CardContent>
      )}
    </Card>
  );
}

export const SellerDashboardPage = () => (
  <>
    <PageHeader title="Tổng quan" />
    <ShopReportSection />
  </>
);

export const SellerWalletPage = () => (
  <>
    <PageHeader title="Ví" />
    <ShopWallet />
  </>
);

// The shop as seen from the account pages: open one, or follow it until it is approved.
export function AccountShopPage() {
  const shop = useMyShop();
  if (shop.isPending) return <Loading />;
  if (shop.error) return <ErrorMessage error={shop.error} />;
  if (!shop.data) return <OpenShop />;
  if (shop.data.status === 'active') return <Navigate to="/seller" replace />;
  return <SellerShopPage />;
}
