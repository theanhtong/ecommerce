import {
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  MapPin,
  Minus,
  Phone,
  Plus,
  UserRound,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ORDER_STATUS, phone } from '@/lib/format';
import type { Location, OrderStatus } from '@/lib/types';

export function PageHeader({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <h1 className="text-lg font-medium">{title}</h1>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

export function Loading() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

export function ErrorMessage({ error }: { error: unknown }) {
  return (
    <p className="text-sm text-destructive">
      {error instanceof Error ? error.message : 'Đã có lỗi xảy ra'}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardContent className="py-6 text-center text-muted-foreground">
        {children}
      </CardContent>
    </Card>
  );
}

export function Pager({
  page,
  prev,
  next,
}: {
  page: number;
  prev?: () => void;
  next?: () => void;
}) {
  if (!prev && !next) return null;
  return (
    <div className="mt-4 flex items-center justify-center gap-3">
      <Button variant="outline" size="sm" disabled={!prev} onClick={prev}>
        <ChevronLeft />
        Trước
      </Button>
      <span className="text-sm tabular-nums">Trang {page}</span>
      <Button variant="outline" size="sm" disabled={!next} onClick={next}>
        Sau
        <ChevronRight />
      </Button>
    </div>
  );
}

const STATUS_VARIANT: Record<
  OrderStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  unpaid: 'outline',
  to_ship: 'secondary',
  shipping: 'secondary',
  delivered: 'default',
  completed: 'default',
  cancelled: 'destructive',
  returned: 'destructive',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{ORDER_STATUS[status]}</Badge>;
}

export function QuantityInput({
  value,
  max = Infinity,
  disabled,
  onChange,
}: {
  value: number;
  max?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (n: number) => {
    setDraft(null);
    const next = Math.min(Math.max(1, Math.trunc(n) || 1), max);
    if (next !== value) onChange(next);
  };
  return (
    <div className="inline-flex h-8 w-fit items-stretch overflow-hidden rounded-md border bg-card">
      <Button
        variant="ghost"
        size="icon-sm"
        className="h-full rounded-none"
        aria-label="Giảm"
        disabled={disabled || value <= 1}
        onClick={() => commit(value - 1)}
      >
        <Minus />
      </Button>
      <input
        inputMode="numeric"
        aria-label="Số lượng"
        className="w-12 border-x bg-transparent text-center text-sm tabular-nums outline-none focus:bg-muted/50 disabled:opacity-50"
        disabled={disabled}
        value={draft ?? value}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
        onBlur={() => draft !== null && commit(Number(draft))}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <Button
        variant="ghost"
        size="icon-sm"
        className="h-full rounded-none"
        aria-label="Tăng"
        disabled={disabled || value >= max}
        onClick={() => commit(value + 1)}
      >
        <Plus />
      </Button>
    </div>
  );
}

export function StockLabel({ stock }: { stock: number }) {
  return stock > 0 ? (
    <span className="text-muted-foreground">Còn {stock} sản phẩm</span>
  ) : (
    <span className="text-destructive">Hết hàng</span>
  );
}

export function ItemImage({
  src,
  className,
}: {
  src?: string | null;
  className?: string;
}) {
  const box = cn('aspect-square shrink-0 rounded-md', className);
  if (src) return <img src={src} alt="" className={cn(box, 'object-cover')} />;
  return (
    <div className={cn(box, 'grid place-items-center bg-muted')}>
      <ImageIcon className="size-1/4 max-w-10 text-muted-foreground/40" />
    </div>
  );
}

export function AddressBlock({
  name,
  phone: tel,
  street,
  location,
}: {
  name: string;
  phone: string;
  street: string;
  location: Location;
}) {
  const row = 'flex gap-3';
  const icon = 'mt-0.5 size-4 shrink-0 text-muted-foreground';
  return (
    <div className="grid gap-3 text-sm">
      <p className={row}>
        <UserRound className={icon} />
        <span className="font-medium">{name}</span>
      </p>
      <p className={row}>
        <Phone className={icon} />
        {phone(tel)}
      </p>
      <p className={row}>
        <MapPin className={icon} />
        <span>
          {street}
          <span className="block text-muted-foreground">
            {location.ward.name}, {location.province.name}
          </span>
        </span>
      </p>
    </div>
  );
}
