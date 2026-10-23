import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Pencil, Plus, Store, Trash2, User } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { NavLink, Outlet } from 'react-router';
import { toast } from 'sonner';
import {
  AddressBlock,
  Empty,
  ErrorMessage,
  Loading,
  PageHeader,
} from '@/components/common';
import { LocationFields } from '@/components/location-fields';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { phone } from '@/lib/format';
import type { Address } from '@/lib/types';

export function Field({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={props.id ?? props.name}>{label}</Label>
      <Input id={props.id ?? props.name} {...props} />
    </div>
  );
}

const TABS = [
  ['/account', 'Hồ sơ', User],
  ['/account/addresses', 'Địa chỉ', MapPin],
  ['/account/seller', 'Cửa hàng', Store],
] as const;

export function AccountLayout() {
  return (
    <div className="grid gap-5 md:grid-cols-[12rem_1fr]">
      <nav className="flex gap-2 md:flex-col">
        {TABS.map(([to, label, Icon]) => (
          <Button
            asChild
            key={to}
            variant="ghost"
            className="justify-start aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
          >
            <NavLink to={to} end={to === '/account'}>
              <Icon />
              {label}
            </NavLink>
          </Button>
        ))}
      </nav>
      <div>
        <Outlet />
      </div>
    </div>
  );
}

const formValues = (e: SubmitEvent<HTMLFormElement>) =>
  Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;

export function AccountPage() {
  const { user, reload } = useAuth();
  const profile = useMutation({
    mutationFn: (username: string) =>
      api('/users/me', { method: 'PATCH', body: { username } }),
    onSuccess: () => {
      toast.success('Đã cập nhật');
      void reload();
    },
  });
  const password = useMutation({
    mutationFn: (body: Record<string, string>) =>
      api('/users/me/password', { method: 'PATCH', body }),
    onSuccess: () => toast.success('Đã đổi mật khẩu'),
  });
  if (!user) return null;

  return (
    <>
      <PageHeader title="Hồ sơ" />
      <div className="grid max-w-3xl gap-5">
        <Card>
          <form
            className="contents"
            onSubmit={(e) => {
              e.preventDefault();
              profile.mutate(formValues(e).username);
            }}
          >
            <CardHeader>
              <CardTitle>Thông tin</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Field label="Email" name="email" value={user.email} disabled />
              <Field
                label="Tên đăng nhập"
                name="username"
                defaultValue={user.username}
                required
              />
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={profile.isPending}>
                Lưu
              </Button>
            </CardFooter>
          </form>
        </Card>
        <Card>
          <form
            className="contents"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              password.mutate(formValues(e), {
                onSuccess: () => form.reset(),
              });
            }}
          >
            <CardHeader>
              <CardTitle>Đổi mật khẩu</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Field
                label="Mật khẩu hiện tại"
                name="currentPassword"
                type="password"
                required
              />
              <Field
                label="Mật khẩu mới"
                name="newPassword"
                type="password"
                required
              />
              <Field
                label="Nhập lại mật khẩu mới"
                name="newPassword"
                type="password"
                required
              />
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={password.isPending}>
                Đổi mật khẩu
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </>
  );
}

function AddressDialog({
  address,
  trigger,
}: {
  address?: Address;
  trigger: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [wardCode, setWardCode] = useState(address?.ward.code ?? '');
  const save = useMutation({
    mutationFn: (body: Record<string, string>) =>
      address
        ? api(`/addresses/${address.id}`, {
            method: 'PATCH',
            body: { ...body, wardCode },
          })
        : api('/addresses', { method: 'POST', body: { ...body, wardCode } }),
    onSuccess: () => {
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['addresses'] });
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setWardCode(address?.ward.code ?? '');
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(formValues(e));
          }}
        >
          <DialogHeader>
            <DialogTitle>{address ? 'Sửa địa chỉ' : 'Địa chỉ mới'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Họ và tên"
              name="recipientName"
              defaultValue={address?.recipientName}
              required
            />
            <Field
              label="Số điện thoại"
              name="phone"
              type="tel"
              defaultValue={address && phone(address.phone)}
              required
            />
          </div>
          <LocationFields
            provinceCode={address?.province.code}
            wardCode={wardCode}
            onWardChange={setWardCode}
          />
          <Field
            label="Địa chỉ cụ thể"
            name="street"
            defaultValue={address?.street}
            required
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Hủy
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!wardCode || save.isPending}>
              Lưu
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteAddress({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const remove = useMutation({
    mutationFn: () => api(`/addresses/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['addresses'] });
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Trash2 />
          Xóa
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Xóa địa chỉ?</DialogTitle>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Hủy</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            Xóa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddressesPage() {
  const queryClient = useQueryClient();
  const addresses = useQuery({
    queryKey: ['addresses'],
    queryFn: () => api<Address[]>('/addresses'),
  });
  const setDefault = useMutation({
    mutationFn: (id: string) =>
      api(`/addresses/${id}/default`, { method: 'PUT' }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['addresses'] }),
  });

  return (
    <>
      <PageHeader
        title="Địa chỉ của tôi"
        actions={
          <AddressDialog
            trigger={
              <Button>
                <Plus />
                Thêm địa chỉ
              </Button>
            }
          />
        }
      />
      {addresses.isPending ? (
        <Loading />
      ) : addresses.error ? (
        <ErrorMessage error={addresses.error} />
      ) : !addresses.data.length ? (
        <Empty>Chưa có địa chỉ</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {addresses.data.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex-1">
                <AddressBlock
                  name={a.recipientName}
                  phone={a.phone}
                  street={a.street}
                  location={a}
                />
              </CardContent>
              <CardFooter className="justify-between gap-2">
                {a.isDefault ? (
                  <Badge>Mặc định</Badge>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={setDefault.isPending}
                    onClick={() => setDefault.mutate(a.id)}
                  >
                    Đặt làm mặc định
                  </Button>
                )}
                <div className="flex gap-1">
                  <AddressDialog
                    address={a}
                    trigger={
                      <Button variant="ghost" size="sm">
                        <Pencil />
                        Sửa
                      </Button>
                    }
                  />
                  <DeleteAddress id={a.id} />
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
