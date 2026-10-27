import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlignLeft,
  Clock,
  Package,
  Pencil,
  ReceiptText,
  Store,
  TicketPercent,
} from 'lucide-react';
import { useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { toast } from 'sonner';
import {
  AddressBlock,
  ErrorMessage,
  Loading,
  PageHeader,
} from '@/components/common';
import { LocationFields } from '@/components/location-fields';
import { Alert, AlertTitle } from '@/components/ui/alert';
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
import { phone, SHOP_STATUS } from '@/lib/format';
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
  ['/account/seller', 'Cửa hàng', Store],
  ['/account/seller/items', 'Sản phẩm', Package],
  ['/account/seller/orders', 'Đơn hàng', ReceiptText],
  ['/account/seller/vouchers', 'Khuyến mãi', TicketPercent],
] as const;

export function SellerLayout() {
  const shop = useMyShop();
  const { pathname } = useLocation();
  if (shop.isPending) return <Loading />;
  if (shop.error) return <ErrorMessage error={shop.error} />;
  if (!shop.data) return <OpenShop />;
  if (shop.data.status !== 'active') {
    return pathname === '/account/seller' ? (
      <Outlet />
    ) : (
      <Navigate to="/account/seller" replace />
    );
  }
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map(([to, label, Icon]) => (
          <Button asChild key={to} variant="outline" size="sm">
            <NavLink
              to={to}
              end={to === '/account/seller'}
              className="aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
            >
              <Icon />
              {label}
            </NavLink>
          </Button>
        ))}
      </div>
      <Outlet />
    </>
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
        </Alert>
      )}
      <div className="grid gap-4">
        {s.status === 'active' && (
          <>
            <ShopWallet />
            <ShopReportSection />
          </>
        )}
        <ShopProfile shop={s} />
      </div>
    </>
  );
}
