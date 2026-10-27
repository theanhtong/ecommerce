import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import {
  Empty,
  ErrorMessage,
  LoadMore,
  Loading,
  ItemImage,
  PageHeader,
  QuantityInput,
  StockLabel,
} from '@/components/common';
import { ItemReviews, RatingSummary } from '@/components/reviews';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { money, priceRange } from '@/lib/format';
import { useCart, usePaged } from '@/lib/queries';
import type { ItemDetail, ItemSummary, Shop } from '@/lib/types';

function ItemGrid({ path, queryKey }: { path: string; queryKey: unknown[] }) {
  const page = usePaged<ItemSummary>(queryKey, path);
  if (page.isPending) return <Loading />;
  if (page.error) return <ErrorMessage error={page.error} />;
  if (!page.items.length) return <Empty>Chưa có sản phẩm</Empty>;
  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {page.items.map((item) => (
          <Link key={item.id} to={`/items/${item.id}`}>
            <Card className="h-full transition hover:ring-primary/40">
              <CardContent className="flex h-full flex-col gap-2">
                <ItemImage />
                <p className="line-clamp-2 font-medium">{item.name}</p>
                <p className="mt-auto font-semibold text-primary">
                  {priceRange(item.priceMin, item.priceMax)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.shop.name} · <StockLabel stock={item.stock} />
                </p>
                <RatingSummary rating={item.rating} count={item.ratingCount} />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <LoadMore
        hasMore={page.hasNextPage}
        loading={page.isFetchingNextPage}
        onClick={() => void page.fetchNextPage()}
      />
    </>
  );
}

export function HomePage() {
  return (
    <>
      <PageHeader title="Sản phẩm mới" />
      <ItemGrid path="/items" queryKey={['items']} />
    </>
  );
}

export function ShopPage() {
  const { id } = useParams();
  const shop = useQuery({
    queryKey: ['shop', id],
    queryFn: () => api<Shop>(`/shops/${id}`),
  });
  if (shop.isPending) return <Loading />;
  if (shop.error) return <ErrorMessage error={shop.error} />;
  return (
    <>
      <PageHeader title={shop.data.name} />
      <div className="-mt-2 mb-4">
        <RatingSummary
          rating={shop.data.rating ?? null}
          count={shop.data.ratingCount ?? 0}
        />
      </div>
      {shop.data.description && (
        <p className="-mt-2 mb-4 text-muted-foreground">
          {shop.data.description}
        </p>
      )}
      <ItemGrid path={`/shops/${id}/items`} queryKey={['shop-items', id]} />
    </>
  );
}

export function ItemPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<number[]>([]);
  const [quantity, setQuantity] = useState(1);
  const item = useQuery({
    queryKey: ['item', id],
    queryFn: () => api<ItemDetail>(`/items/${id}`),
  });
  const cart = useCart(!!user);
  const addToCart = useMutation({
    mutationFn: (modelId: string) =>
      api('/cart/items', { method: 'POST', body: { modelId, quantity: qty } }),
    onSuccess: () => {
      setQuantity(1);
      toast.success('Đã thêm vào giỏ hàng');
      void queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
  });

  if (item.isPending) return <Loading />;
  if (item.error) return <ErrorMessage error={item.error} />;
  const { tierVariations, models } = item.data;
  const model =
    picked.length === tierVariations.length
      ? models.find((m) => m.tierIndex.join() === picked.join())
      : undefined;
  const prices = models.map((m) => m.price);
  const inCart =
    cart.data?.shops
      .flatMap((s) => s.items)
      .find((l) => l.modelId === model?.id)?.quantity ?? 0;
  const maxAdd = model ? Math.max(0, model.stock - inCart) : undefined;
  const qty = Math.min(quantity, Math.max(1, maxAdd ?? quantity));

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="grid gap-8 md:grid-cols-[2fr_3fr]">
          <ItemImage className="rounded-lg" />
          <div className="flex flex-col gap-5">
            <div>
              <h1 className="text-xl font-medium">{item.data.name}</h1>
              <RatingSummary
                rating={item.data.rating}
                count={item.data.ratingCount}
              />
              <Button asChild variant="secondary" size="sm" className="mt-2">
                <Link to={`/shops/${item.data.shop.id}`}>
                  {item.data.shop.name}
                </Link>
              </Button>
            </div>
            <p className="text-2xl font-medium text-primary">
              {model
                ? money(model.price)
                : priceRange(Math.min(...prices), Math.max(...prices))}
            </p>
            {tierVariations.map((tier, t) => (
              <div key={tier.name} className="grid gap-2">
                <span className="text-sm text-muted-foreground">
                  {tier.name}
                </span>
                <div className="flex flex-wrap gap-2">
                  {tier.options.map((option, o) => (
                    <Button
                      key={option}
                      size="sm"
                      variant={picked[t] === o ? 'default' : 'outline'}
                      onClick={() => {
                        const next = [...picked];
                        next[t] = o;
                        setPicked(next);
                      }}
                    >
                      {option}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            {user?.role !== 'admin' && (
              <>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    Số lượng
                  </span>
                  <QuantityInput
                    value={qty}
                    max={maxAdd || undefined}
                    onChange={setQuantity}
                  />
                  <span className="text-sm">
                    <StockLabel
                      stock={
                        model?.stock ?? models.reduce((n, m) => n + m.stock, 0)
                      }
                    />
                    {inCart > 0 && (
                      <span className="text-muted-foreground">
                        {' '}
                        · Trong giỏ {inCart}
                      </span>
                    )}
                  </span>
                </div>
                <Button
                  size="lg"
                  className="w-fit"
                  disabled={!model || maxAdd === 0 || addToCart.isPending}
                  onClick={() => {
                    if (!user)
                      navigate('/login', { state: { from: `/items/${id}` } });
                    else if (model) addToCart.mutate(model.id);
                  }}
                >
                  {model?.stock === 0
                    ? 'Hết hàng'
                    : maxAdd === 0
                      ? 'Đã đạt số lượng tối đa'
                      : 'Thêm vào giỏ hàng'}
                </Button>
              </>
            )}
            {item.data.description && (
              <>
                <Separator />
                <p className="whitespace-pre-line text-sm">
                  {item.data.description}
                </p>
              </>
            )}
          </div>
        </CardContent>
      </Card>
      <ItemReviews
        itemId={item.data.id}
        rating={item.data.rating}
        count={item.data.ratingCount}
      />
    </div>
  );
}
