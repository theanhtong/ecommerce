import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { myShopQuery } from '@/lib/queries';

function AuthCard({
  title,
  fields,
  submit,
  pending,
  onSubmit,
  footer,
  children,
}: {
  title: string;
  fields: { name: string; label: string; type?: string }[];
  submit: string;
  pending: boolean;
  onSubmit: (values: Record<string, string>) => void;
  footer: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const handle = (e: SubmitEvent) => {
    e.preventDefault();
    onSubmit(values);
  };
  return (
    <>
      <Card className="mx-auto mt-10 max-w-sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <form className="contents" onSubmit={handle}>
          <CardContent className="grid gap-4">
            {fields.map((f) => (
              <div className="grid gap-2" key={f.name}>
                <Label htmlFor={f.name}>{f.label}</Label>
                <Input
                  id={f.name}
                  type={f.type ?? 'text'}
                  required
                  value={values[f.name] ?? ''}
                  onChange={(e) =>
                    setValues({ ...values, [f.name]: e.target.value })
                  }
                />
              </div>
            ))}
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={pending}>
              {submit}
            </Button>
            {footer}
          </CardFooter>
        </form>
      </Card>
      {children}
    </>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const mutation = useMutation({
    mutationFn: (v: Record<string, string>) => login(v.email, v.password),
    // Back to the page that asked for a login; otherwise a shop owner lands in the seller centre.
    onSuccess: async () => {
      const shop = from
        ? null
        : await queryClient.fetchQuery(myShopQuery).catch(() => null);
      navigate(from ?? (shop?.status === 'active' ? '/seller' : '/'), {
        replace: true,
      });
    },
  });
  const banned =
    mutation.error instanceof ApiError && mutation.error.status === 403
      ? mutation.error
      : null;
  return (
    <AuthCard
      title="Đăng nhập"
      submit="Đăng nhập"
      pending={mutation.isPending}
      onSubmit={(v) => mutation.mutate(v)}
      fields={[
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'password', label: 'Mật khẩu', type: 'password' },
      ]}
      footer={
        <>
          {banned && (
            <Alert variant="destructive">
              <AlertTitle>Tài khoản đã bị khóa</AlertTitle>
              {banned.reason && (
                <AlertDescription className="whitespace-pre-line">
                  {banned.reason}
                </AlertDescription>
              )}
            </Alert>
          )}
          <Button asChild variant="outline" className="w-full">
            <Link to="/register">Tạo tài khoản</Link>
          </Button>
        </>
      }
    >
      {__DEMO_ACCOUNTS__.length > 0 && (
        <Card className="mx-auto mt-6 max-w-3xl">
          <CardHeader>
            <CardTitle className="text-base">Tài khoản demo</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-3">
            {(
              [
                ['buyer', 'Người mua'],
                ['seller', 'Cửa hàng'],
                ['admin', 'Quản trị'],
              ] as const
            ).map(([group, title]) => (
              <div key={group} className="grid content-start gap-2">
                <p className="text-sm text-muted-foreground">{title}</p>
                {__DEMO_ACCOUNTS__
                  .filter((a) => a.group === group)
                  .map(({ label, email, password }) => (
                    <Button
                      key={email}
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="justify-start"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ email, password })}
                    >
                      {label}
                    </Button>
                  ))}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </AuthCard>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: (v: Record<string, string>) =>
      register({ email: v.email, username: v.username, password: v.password }),
    onSuccess: () => navigate('/', { replace: true }),
  });
  return (
    <AuthCard
      title="Đăng ký"
      submit="Đăng ký"
      pending={mutation.isPending}
      onSubmit={(v) => mutation.mutate(v)}
      fields={[
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'username', label: 'Tên đăng nhập' },
        { name: 'password', label: 'Mật khẩu', type: 'password' },
      ]}
      footer={
        <Button asChild variant="outline" className="w-full">
          <Link to="/login">Đã có tài khoản</Link>
        </Button>
      }
    />
  );
}
