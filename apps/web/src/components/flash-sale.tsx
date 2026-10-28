import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ItemImage } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import type { FlashSaleModel } from '@/lib/types';

const pad = (n: number) => String(n).padStart(2, '0');

export function Countdown({ to, small }: { to: string; small?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const left = Math.max(0, Math.floor((Date.parse(to) - now) / 1000));
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${small ? 'text-[11px]' : 'text-sm'}`}
    >
      {[Math.floor(left / 3600), Math.floor(left / 60) % 60, left % 60].map(
        (n, i) => (
          <span key={i} className="inline-flex items-center gap-0.5">
            {i > 0 && <span className="text-primary">:</span>}
            <span
              className={`grid place-items-center rounded-md bg-primary text-primary-foreground ${small ? 'h-5 min-w-5 px-1' : 'h-7 min-w-7 px-1.5'}`}
            >
              {pad(n)}
            </span>
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
        Đã bán {sold}/{quota}
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
  const row = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);
  const measure = useCallback(() => {
    const el = row.current;
    if (el) setScrollable(el.scrollWidth > el.clientWidth + 1);
  }, []);
  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure, sales.data]);
  if (!sales.data?.length) return null;
  // One view at a time; past either end it wraps around to the other.
  const slide = (direction: 1 | -1) => {
    const el = row.current;
    if (!el) return;
    const last = el.scrollWidth - el.clientWidth;
    const atStart = el.scrollLeft <= 1;
    const atEnd = el.scrollLeft >= last - 1;
    el.scrollTo({
      left:
        direction === 1 && atEnd
          ? 0
          : direction === -1 && atStart
            ? last
            : el.scrollLeft + direction * el.clientWidth,
      behavior: 'smooth',
    });
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-3 text-primary">
          <Zap className="size-5 fill-primary" />
          Flash Sale
        </CardTitle>
      </CardHeader>
      <CardContent className="relative">
        {scrollable && (
          <Button
            variant="outline"
            size="icon"
            aria-label="Trước"
            className="absolute top-1/2 left-2 z-10 -translate-y-1/2 rounded-full shadow-md"
            onClick={() => slide(-1)}
          >
            <ChevronLeft />
          </Button>
        )}
        {scrollable && (
          <Button
            variant="outline"
            size="icon"
            aria-label="Sau"
            className="absolute top-1/2 right-2 z-10 -translate-y-1/2 rounded-full shadow-md"
            onClick={() => slide(1)}
          >
            <ChevronRight />
          </Button>
        )}
        <div
          ref={row}
          className="grid auto-cols-[calc((100%-1rem)/2)] grid-flow-col gap-4 overflow-x-auto scroll-smooth [scrollbar-width:none] snap-x snap-mandatory sm:auto-cols-[calc((100%-3rem)/4)] lg:auto-cols-[calc((100%-5rem)/6)]"
        >
          {sales.data.map((m) => (
            <Link
              key={m.id}
              to={`/flash-sales/${m.id}`}
              className="grid snap-start gap-1.5"
            >
              <ItemImage src={m.image} />
              <p className="line-clamp-1 text-sm">{m.itemName}</p>
              <p className="font-semibold text-primary">{money(m.price)}</p>
              <p className="text-xs text-muted-foreground line-through">
                {money(m.originalPrice)}
              </p>
              <SoldBar sold={m.sold} quota={m.quota} />
              <Countdown to={m.endsAt} small />
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
