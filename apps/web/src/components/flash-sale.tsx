import { useQuery } from '@tanstack/react-query';
import { Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ItemImage } from '@/components/common';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import type { FlashSaleModel } from '@/lib/types';

const pad = (n: number) => String(n).padStart(2, '0');

export function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const left = Math.max(0, Math.floor((Date.parse(to) - now) / 1000));
  return (
    <span className="inline-flex gap-1 font-mono text-sm tabular-nums">
      {[Math.floor(left / 3600), Math.floor(left / 60) % 60, left % 60].map(
        (n, i) => (
          <span
            key={i}
            className="rounded bg-foreground px-1.5 py-0.5 text-background"
          >
            {pad(n)}
          </span>
        ),
      )}
    </span>
  );
}

export function SalePrice({
  price,
  originalPrice,
  className,
}: {
  price: number;
  originalPrice?: number | null;
  className?: string;
}) {
  return (
    <span className={className}>
      {originalPrice != null && (
        <span className="mr-1.5 text-muted-foreground line-through">
          {money(originalPrice)}
        </span>
      )}
      {money(price)}
    </span>
  );
}

export function SoldBar({ sold, quota }: { sold: number; quota: number }) {
  return (
    <div className="relative h-4 overflow-hidden rounded-full bg-primary/15 text-center text-[10px] leading-4 font-medium">
      <div
        className="absolute inset-y-0 left-0 bg-primary/70"
        style={{ width: `${Math.min(100, (sold / quota) * 100)}%` }}
      />
      <span className="relative">
        {sold === 0 ? 'Đang bán chạy' : `Đã bán ${sold}/${quota}`}
      </span>
    </div>
  );
}

export function FlashSaleStrip() {
  const sales = useQuery({
    queryKey: ['flash-sales'],
    queryFn: () => api<(FlashSaleModel & { endsAt: string })[]>('/flash-sales'),
    refetchInterval: 60_000,
  });
  if (!sales.data?.length) return null;
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-3 text-primary">
          <Zap className="size-5 fill-primary" />
          Flash Sale
          <Countdown to={sales.data[0].endsAt} />
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        {sales.data.map((m) => (
          <Link key={m.id} to={`/items/${m.itemId}`} className="grid gap-1.5">
            <ItemImage src={m.image} />
            <p className="line-clamp-1 text-sm">{m.itemName}</p>
            <p className="font-semibold text-primary">{money(m.price)}</p>
            <p className="text-xs text-muted-foreground line-through">
              {money(m.originalPrice)}
            </p>
            <SoldBar sold={m.sold} quota={m.quota} />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
