import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ChevronLeft, Store, Zap } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import {
  Empty,
  ErrorMessage,
  Pager,
  Loading,
  ItemImage,
  PageHeader,
  QuantityInput,
  StockLabel,
} from '@/components/common';
import {
  Countdown,
  FlashSaleStrip,
  SalePrice,
  SoldBar,
} from '@/components/flash-sale';
import { ItemGallery } from '@/components/item-images';
import { ItemReviews, RatingSummary } from '@/components/reviews';
import { Filter } from '@/components/filter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { money, priceRange } from '@/lib/format';
import { useCart, usePaged } from '@/lib/queries';
import type {
  FlashSalePage as FlashSalePageData,
  ItemDetail,
  ItemSummary,
  Shop,
} from '@/lib/types';

const GRID = 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4';

function ItemCard({ item }: { item: ItemSummary & { sold?: number } }) {
  return (
    <Link to={`/items/${item.id}`}>
      <Card className="h-full transition hover:ring-primary/40">
        <CardContent className="flex h-full flex-col gap-2">
          <ItemImage src={item.image} />
          <p className="line-clamp-2 font-medium">{item.name}</p>
          <p className="mt-auto font-semibold text-primary">
            {priceRange(item.priceMin, item.priceMax)}
          </p>
          <p className="text-xs text-muted-foreground">
            {item.shop.name} · <StockLabel stock={item.stock} />
            {!!item.sold && ` · Đã bán ${item.sold}`}
          </p>
          <RatingSummary rating={item.rating} count={item.ratingCount} />
        </CardContent>
      </Card>
    </Link>
  );
}

function ItemGrid({ path, queryKey }: { path: string; queryKey: unknown[] }) {
  const page = usePaged<ItemSummary>(queryKey, path);
  if (page.isPending) return <Loading />;
  if (page.error) return <ErrorMessage error={page.error} />;
  if (!page.items.length) return <Empty>Chưa có sản phẩm</Empty>;
  return (
    <>
      <div className={GRID}>
        {page.items.map((item) => (
          <ItemCard key={item.id} item={item} />
        ))}
      </div>
      <Pager page={page.page} prev={page.prev} next={page.next} />
    </>
  );
}

export function HomePage() {
  return (
    <>
      <FlashSaleStrip />
      <PageHeader title="Sản phẩm mới" />
      <ItemGrid path="/items" queryKey={['items']} />
    </>
  );
}

const SORTS = {
  relevance: 'Liên quan',
  newest: 'Mới nhất',
  sales: 'Bán chạy',
  price_asc: 'Giá thấp',
  price_desc: 'Giá cao',
  rating: 'Đánh giá',
} as const;

const RATINGS = {
  any: 'Tất cả',
  r5: 'Từ 5 sao',
  r4: 'Từ 4 sao',
  r3: 'Từ 3 sao',
} as const;

interface SearchResult {
  items: (ItemSummary & { sold: number })[];
  page: number;
  total: number;
  hasMore: boolean;
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const sort = (params.get('sort') ?? 'relevance') as keyof typeof SORTS;
  const rating = (params.get('rating') ?? 'any') as keyof typeof RATINGS;
  const [minPrice, setMinPrice] = useState(params.get('minPrice') ?? '');
  const [maxPrice, setMaxPrice] = useState(params.get('maxPrice') ?? '');
  const set = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next);
  };

  const query = new URLSearchParams({ sort });
  if (q) query.set('q', q);
  if (rating !== 'any') query.set('minRating', rating.slice(1));
  for (const key of ['minPrice', 'maxPrice']) {
    const value = params.get(key);
    if (value) query.set(key, value);
  }
  // Back to page 1 whenever the search or its filters change.
  const [paged, setPaged] = useState({ query: query.toString(), page: 1 });
  const page = paged.query === query.toString() ? paged.page : 1;
  const goTo = (to: number) => setPaged({ query: query.toString(), page: to });
  const results = useQuery({
    queryKey: ['search', query.toString(), page],
    queryFn: () => api<SearchResult>(`/items/search?${query}&page=${page}`),
    placeholderData: keepPreviousData,
  });
  const items = results.data?.items ?? [];

  return (
    <>
      <PageHeader title={q ? `Kết quả cho "${q}"` : 'Tìm kiếm'} />
      <Card className="mb-4">
        <CardContent className="grid gap-3">
          <Filter
            labels={SORTS}
            value={sort}
            onChange={(value) => set({ sort: value })}
          />
          <Filter
            labels={RATINGS}
            value={rating}
            onChange={(value) => set({ rating: value === 'any' ? '' : value })}
          />
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              set({ minPrice, maxPrice });
            }}
          >
            <Input
              type="number"
              min={0}
              aria-label="Giá từ"
              placeholder="Giá từ"
              className="w-32"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
            />
            <Input
              type="number"
              min={0}
              aria-label="Giá đến"
              placeholder="Giá đến"
              className="w-32"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
            />
            <Button type="submit" variant="outline" size="sm">
              Áp dụng
            </Button>
          </form>
        </CardContent>
      </Card>
      {results.isPending ? (
        <Loading />
      ) : results.error ? (
        <ErrorMessage error={results.error} />
      ) : !items.length ? (
        <Empty>Không tìm thấy sản phẩm</Empty>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            {results.data.total} sản phẩm
          </p>
          <div className={GRID}>
            {items.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        </>
      )}
      <Pager
        page={page}
        prev={page > 1 ? () => goTo(page - 1) : undefined}
        next={results.data?.hasMore ? () => goTo(page + 1) : undefined}
      />
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

function ShopStrip({ id, name }: { id: string; name: string }) {
  const shop = useQuery({
    queryKey: ['shop', id],
    queryFn: () => api<Shop>(`/shops/${id}`),
  });
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <Store className="size-6" />
        </span>
        <div className="grid min-w-0 flex-1 gap-1">
          <p className="truncate font-medium">{name}</p>
          <RatingSummary
            rating={shop.data?.rating ?? null}
            count={shop.data?.ratingCount ?? 0}
          />
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to={`/shops/${id}`}>
            <Store />
            Xem shop
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// Back to wherever the buyer came from; a page opened straight from a link goes home.
function BackButton() {
  const navigate = useNavigate();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 justify-self-start"
      onClick={() =>
        (window.history.state as { idx?: number } | null)?.idx
          ? navigate(-1)
          : navigate('/')
      }
    >
      <ChevronLeft />
      Quay lại
    </Button>
  );
}

export function ItemPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<number[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [shown, setShown] = useState(0);
  const item = useQuery({
    queryKey: ['item', id],
    queryFn: () => api<ItemDetail>(`/items/${id}`),
  });
  const cart = useCart(!!user);
  // The buyer's flash sale allowance per model on sale; a used-up one hides its strip.
  const saleIds = (item.data?.models ?? []).flatMap((m) =>
    m.flashSale ? [m.flashSale.id] : [],
  );
  const allowances = useQueries({
    queries: saleIds.map((saleId) => ({
      queryKey: ['flash-sale', saleId, 'allowance'],
      queryFn: () =>
        api<{ allowance: number }>(`/flash-sales/${saleId}/allowance`),
      enabled: user?.role === 'user',
    })),
  });
  const usedUp = (saleId: string) =>
    allowances[saleIds.indexOf(saleId)]?.data?.allowance === 0;
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
  // The picked model's flash sale, or any model's while none is picked.
  const open = models.map((m) => m.flashSale).filter((f) => f && !usedUp(f.id));
  const onSale = model
    ? model.flashSale && !usedUp(model.flashSale.id) && model.flashSale
    : open[0];
  const inCart =
    cart.data?.shops
      .flatMap((s) => s.items)
      .find((l) => l.modelId === model?.id)?.quantity ?? 0;
  const maxAdd = model ? Math.max(0, model.stock - inCart) : undefined;
  const qty = Math.min(quantity, Math.max(1, maxAdd ?? quantity));

  return (
    <div className="grid gap-4">
      <BackButton />
      <Card>
        <CardContent className="grid gap-8 md:grid-cols-[2fr_3fr]">
          <ItemGallery
            images={item.data.images}
            picked={shown}
            onPick={setShown}
          />
          <div className="flex flex-col gap-5">
            <div>
              <h1 className="text-xl font-medium">{item.data.name}</h1>
              <RatingSummary
                rating={item.data.rating}
                count={item.data.ratingCount}
              />
            </div>
            {onSale && (
              <div className="flex flex-wrap items-center gap-3 rounded-md bg-primary/10 px-3 py-2 text-sm">
                <span className="flex items-center gap-1 font-semibold text-primary">
                  <Zap className="size-4 fill-primary" />
                  Giá sốc
                </span>
                <Countdown to={onSale.endsAt} />
                <Button asChild size="sm" className="ml-auto">
                  <Link to={`/flash-sales/${onSale.id}`}>
                    Mua giá {money(onSale.price)}
                  </Link>
                </Button>
              </div>
            )}
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
                    disabled={!model}
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
      <ShopStrip id={item.data.shop.id} name={item.data.shop.name} />
      <ItemReviews
        itemId={item.data.id}
        rating={item.data.rating}
        count={item.data.ratingCount}
      />
    </div>
  );
}

const FLASH_STATUS: Record<FlashSalePageData['status'], string> = {
  running: 'Giá sốc',
  upcoming: 'Giá sốc chưa bắt đầu',
  sold_out: 'Giá sốc đã hết suất',
  ended: 'Giá sốc đã kết thúc',
};

// A flash sale is bought on its own page, straight to checkout and never through the cart.
export function FlashSalePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [quantity, setQuantity] = useState(1);
  const [shown, setShown] = useState(0);
  const sale = useQuery({
    queryKey: ['flash-sale', id],
    queryFn: () => api<FlashSalePageData>(`/flash-sales/${id}`),
  });
  const item = useQuery({
    queryKey: ['item', sale.data?.itemId],
    queryFn: () => api<ItemDetail>(`/items/${sale.data!.itemId}`),
    enabled: !!sale.data,
  });
  const allowance = useQuery({
    queryKey: ['flash-sale', id, 'allowance'],
    queryFn: () => api<{ allowance: number }>(`/flash-sales/${id}/allowance`),
    enabled: user?.role === 'user',
  });

  if (sale.isPending || item.isPending) return <Loading />;
  if (sale.error) return <ErrorMessage error={sale.error} />;
  if (item.error) return <ErrorMessage error={item.error} />;
  const s = sale.data;
  const running = s.status === 'running';
  // Already bought the whole allowance: nothing left to buy here.
  const canBuy = running && allowance.data?.allowance !== 0;
  const max =
    allowance.data?.allowance ?? Math.min(s.quota - s.sold, s.purchaseLimit);
  const qty = Math.min(quantity, Math.max(1, max));

  return (
    <div className="grid gap-4">
      <BackButton />
      <Card>
        <CardContent className="grid gap-8 md:grid-cols-[2fr_3fr]">
          <ItemGallery
            images={item.data.images}
            picked={shown}
            onPick={setShown}
          />
          <div className="flex flex-col gap-5">
            <div>
              <h1 className="text-xl font-medium">{s.itemName}</h1>
              {s.variation && (
                <p className="text-muted-foreground">{s.variation}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 rounded-md bg-primary/10 px-3 py-2 text-sm">
              <span className="flex items-center gap-1 font-semibold text-primary">
                <Zap className="size-4 fill-primary" />
                Giá sốc
              </span>
              {running ? (
                <Countdown to={s.endsAt} />
              ) : (
                <span className="text-muted-foreground">
                  {FLASH_STATUS[s.status]}
                </span>
              )}
            </div>
            <SalePrice
              className="text-2xl font-medium text-primary"
              price={s.price}
              originalPrice={s.originalPrice}
            />
            <div className="grid max-w-xs gap-1">
              <SoldBar sold={s.sold} quota={s.quota} />
              <span className="text-sm text-muted-foreground">
                Tối đa {s.purchaseLimit} sản phẩm/người
              </span>
            </div>
            {user?.role !== 'admin' && canBuy && (
              <>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    Số lượng
                  </span>
                  <QuantityInput
                    value={qty}
                    max={Math.max(1, max)}
                    onChange={setQuantity}
                  />
                </div>
                <Button
                  size="lg"
                  className="w-fit"
                  onClick={() => {
                    if (!user) {
                      navigate('/login', {
                        state: { from: `/flash-sales/${id}` },
                      });
                    } else {
                      navigate('/checkout', {
                        state: { flash: { id, quantity: qty } },
                      });
                    }
                  }}
                >
                  Mua ngay
                </Button>
              </>
            )}
            {!canBuy && (
              <Button asChild variant="outline" className="w-fit">
                <Link to={`/items/${s.itemId}`}>Xem sản phẩm</Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      <ShopStrip id={s.shop.id} name={s.shop.name} />
      <ItemReviews
        itemId={s.itemId}
        rating={item.data.rating}
        count={item.data.ratingCount}
      />
    </div>
  );
}
