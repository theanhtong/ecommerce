import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import {
  ChevronLeft,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  Empty,
  ErrorMessage,
  ItemImage,
  LoadMore,
  Loading,
  PageHeader,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/pages/account';
import { ImportCsv } from '@/pages/seller/other';
import { api } from '@/lib/api';
import { priceRange } from '@/lib/format';
import { usePaged } from '@/lib/queries';
import type { ItemDetail, ItemSummary, Model } from '@/lib/types';

function DeleteItem({
  id,
  name,
  onDeleted,
}: {
  id: string;
  name: string;
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const remove = useMutation({
    mutationFn: () => api(`/items/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setOpen(false);
      toast.success('Đã xóa sản phẩm');
      queryClient.removeQueries({ queryKey: ['my-item', id] });
      void queryClient.invalidateQueries({ queryKey: ['my-items'] });
      onDeleted?.();
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
          <DialogTitle>Xóa sản phẩm?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{name}</p>
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

const ITEM_STATUS = { active: 'Đang bán', hidden: 'Đã ẩn', banned: 'Bị khóa' };

export function SellerItemsPage() {
  const page = usePaged<ItemSummary>(['my-items'], '/items/mine');
  return (
    <>
      <PageHeader
        title="Sản phẩm"
        actions={
          <>
            <ImportCsv />
            <NewItemDialog />
          </>
        }
      />
      {page.isPending ? (
        <Loading />
      ) : page.error ? (
        <ErrorMessage error={page.error} />
      ) : !page.items.length ? (
        <Empty>Chưa có sản phẩm</Empty>
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên</TableHead>
                  <TableHead>Giá</TableHead>
                  <TableHead>Có thể bán</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.name}</TableCell>
                    <TableCell>{priceRange(i.priceMin, i.priceMax)}</TableCell>
                    <TableCell>{i.stock}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{ITEM_STATUS[i.status]}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button asChild variant="outline" size="sm">
                          <Link to={`/account/seller/items/${i.id}`}>
                            <Pencil />
                            Sửa
                          </Link>
                        </Button>
                        {i.status !== 'banned' && (
                          <DeleteItem id={i.id} name={i.name} />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <LoadMore
        hasMore={page.hasNextPage}
        loading={page.isFetchingNextPage}
        onClick={() => void page.fetchNextPage()}
      />
    </>
  );
}

interface Tier {
  name: string;
  options: string[];
}

const optionsOf = (tier: Tier) =>
  tier.options.map((o) => o.trim()).filter(Boolean);

function combinations(tiers: Tier[]) {
  return tiers.reduce<number[][]>(
    (combos, tier) =>
      combos.flatMap((c) => optionsOf(tier).map((_, i) => [...c, i])),
    [[]],
  );
}

function NewItemDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [rows, setRows] = useState<
    Record<string, { price: string; stock: string; sku: string }>
  >({});
  const combos = combinations(tiers);
  const row = (key: string) => rows[key] ?? { price: '', stock: '0', sku: '' };

  const create = useMutation({
    mutationFn: (form: Record<string, string>) =>
      api<ItemDetail>('/items', {
        method: 'POST',
        body: {
          name: form.name,
          parentSku: form.parentSku || undefined,
          description: form.description || undefined,
          weight: Number(form.weight),
          tierVariations: tiers.map((t) => ({
            name: t.name.trim(),
            options: optionsOf(t),
          })),
          models: combos.map((tierIndex) => {
            const r = row(tierIndex.join());
            return {
              tierIndex,
              price: Number(r.price),
              stock: Number(r.stock),
              sku: r.sku || undefined,
            };
          }),
        },
      }),
    onSuccess: () => {
      toast.success('Đã tạo sản phẩm');
      void queryClient.invalidateQueries({ queryKey: ['my-items'] });
      setOpen(false);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setTiers([]);
          setRows({});
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Thêm sản phẩm
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <form
          className="grid gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(
              Object.fromEntries(new FormData(e.currentTarget)) as Record<
                string,
                string
              >,
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>Thêm sản phẩm</DialogTitle>
          </DialogHeader>

          <section className="grid gap-4 sm:grid-cols-2">
            <Field label="Tên sản phẩm" name="name" required />
            <Field label="Mã sản phẩm" name="parentSku" />
            <Field
              label="Cân nặng (g)"
              name="weight"
              type="number"
              min={1}
              required
            />
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="description">Mô tả</Label>
              <Textarea id="description" name="description" rows={4} />
            </div>
          </section>

          <Separator />

          <section className="grid gap-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Phân loại hàng</h3>
              {tiers.length < 2 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setTiers([...tiers, { name: '', options: [''] }])
                  }
                >
                  <Plus />
                  Thêm nhóm phân loại
                </Button>
              )}
            </div>
            {tiers.map((tier, t) => {
              const setTier = (next: Tier) =>
                setTiers(tiers.map((x, i) => (i === t ? next : x)));
              return (
                <div key={t} className="grid gap-3 rounded-md border p-4">
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Field
                        label={`Nhóm phân loại ${t + 1}`}
                        name={`tier${t}`}
                        value={tier.name}
                        required
                        onChange={(e) =>
                          setTier({ ...tier, name: e.target.value })
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setTiers(tiers.filter((_, i) => i !== t))}
                    >
                      <Trash2 />
                      Xóa nhóm
                    </Button>
                  </div>
                  <Label>Tùy chọn</Label>
                  <div className="flex flex-wrap gap-2">
                    {tier.options.map((option, o) => (
                      <div key={o} className="flex">
                        <Input
                          aria-label={`Tùy chọn ${o + 1}`}
                          className="w-36"
                          value={option}
                          required
                          onChange={(e) =>
                            setTier({
                              ...tier,
                              options: tier.options.map((x, i) =>
                                i === o ? e.target.value : x,
                              ),
                            })
                          }
                        />
                        {tier.options.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Xóa tùy chọn"
                            onClick={() =>
                              setTier({
                                ...tier,
                                options: tier.options.filter((_, i) => i !== o),
                              })
                            }
                          >
                            <X />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setTier({ ...tier, options: [...tier.options, ''] })
                      }
                    >
                      <Plus />
                      Thêm tùy chọn
                    </Button>
                  </div>
                </div>
              );
            })}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phân loại</TableHead>
                  <TableHead>Giá</TableHead>
                  <TableHead>Kho hàng</TableHead>
                  <TableHead>SKU</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {combos.map((tierIndex) => {
                  const key = tierIndex.join();
                  const r = row(key);
                  const set = (field: keyof typeof r, value: string) =>
                    setRows({ ...rows, [key]: { ...r, [field]: value } });
                  return (
                    <TableRow key={key}>
                      <TableCell>
                        {tierIndex
                          .map((o, t) => optionsOf(tiers[t])[o])
                          .join(', ') || 'Mặc định'}
                      </TableCell>
                      <TableCell>
                        <Input
                          aria-label="Giá"
                          type="number"
                          min={1}
                          required
                          value={r.price}
                          onChange={(e) => set('price', e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          aria-label="Kho hàng"
                          type="number"
                          min={0}
                          required
                          value={r.stock}
                          onChange={(e) => set('stock', e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          aria-label="SKU"
                          value={r.sku}
                          onChange={(e) => set('sku', e.target.value)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </section>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Hủy
              </Button>
            </DialogClose>
            <Button type="submit" disabled={create.isPending}>
              Lưu
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ModelRow({
  itemId,
  model,
  label,
}: {
  itemId: string;
  model: Model;
  label: string;
}) {
  const queryClient = useQueryClient();
  const [price, setPrice] = useState(String(model.price));
  const [sku, setSku] = useState(model.sku ?? '');
  const [delta, setDelta] = useState('');
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['my-item', itemId] });
  const save = useMutation({
    mutationFn: () =>
      api(`/models/${model.id}`, {
        method: 'PATCH',
        body: { price: Number(price), sku: sku.trim() || null },
      }),
    onSuccess: () => {
      toast.success('Đã cập nhật');
      refresh();
    },
  });
  const adjust = useMutation({
    mutationFn: () => {
      const amount = Number(delta);
      return api(`/models/${model.id}/stock-adjustments`, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: { delta: amount, reason: amount > 0 ? 'restock' : 'adjust' },
      });
    },
    onSuccess: () => {
      setDelta('');
      refresh();
    },
  });
  const dirty =
    Number(price) !== model.price || (sku.trim() || null) !== model.sku;

  return (
    <TableRow>
      <TableCell className="font-medium">{label}</TableCell>
      <TableCell>
        <Input
          aria-label="SKU"
          className="w-32"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
        />
      </TableCell>
      <TableCell>
        <div className="relative w-36">
          <Input
            aria-label="Giá"
            type="number"
            min={1}
            className="pr-7 text-right tabular-nums"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">
            ₫
          </span>
        </div>
      </TableCell>
      <TableCell
        className={`text-right tabular-nums ${model.stock === 0 ? 'text-destructive' : ''}`}
      >
        {model.stock}
      </TableCell>
      <TableCell className="text-right text-muted-foreground tabular-nums">
        {model.onHand}
      </TableCell>
      <TableCell className="text-right text-muted-foreground tabular-nums">
        {model.reserved}
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-2">
          <Input
            aria-label="Điều chỉnh tồn kho"
            type="number"
            className="w-20 text-right tabular-nums"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={
              !Number.isInteger(Number(delta)) ||
              !Number(delta) ||
              adjust.isPending
            }
            onClick={() => adjust.mutate()}
          >
            Điều chỉnh
          </Button>
        </div>
      </TableCell>
      <TableCell className="text-right">
        <Button
          size="sm"
          disabled={!dirty || !(Number(price) > 0) || save.isPending}
          onClick={() => save.mutate()}
        >
          Lưu
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function SellerItemPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const item = useQuery({
    queryKey: ['my-item', id],
    queryFn: () => api<ItemDetail>(`/items/mine/${id}`),
  });
  const onSaved = (data: ItemDetail) => {
    queryClient.setQueryData(['my-item', id], data);
    void queryClient.invalidateQueries({ queryKey: ['my-items'] });
  };
  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<ItemDetail>(`/items/${id}`, { method: 'PATCH', body }),
    onSuccess: (data) => {
      onSaved(data);
      toast.success('Đã cập nhật');
    },
  });
  const setStatus = useMutation({
    mutationFn: (status: 'active' | 'hidden') =>
      api<ItemDetail>(`/items/${id}/status`, {
        method: 'PATCH',
        body: { status },
      }),
    onSuccess: onSaved,
  });

  if (item.isPending) return <Loading />;
  if (item.error) return <ErrorMessage error={item.error} />;
  const i = item.data;
  const prices = i.models.map((m) => m.price);
  const sum = (key: 'stock' | 'onHand' | 'reserved') =>
    i.models.reduce((n, m) => n + (m[key] ?? 0), 0);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link to="/account/seller/items">
          <ChevronLeft />
          Quay lại
        </Link>
      </Button>
      <PageHeader
        title={i.name}
        actions={
          <>
            {i.status !== 'banned' && (
              <DeleteItem
                id={i.id}
                name={i.name}
                onDeleted={() => navigate('/account/seller/items')}
              />
            )}
            {i.status !== 'banned' && (
              <Button
                variant="outline"
                disabled={setStatus.isPending}
                onClick={() =>
                  setStatus.mutate(i.status === 'active' ? 'hidden' : 'active')
                }
              >
                {i.status === 'active' ? <EyeOff /> : <Eye />}
                {i.status === 'active' ? 'Ẩn sản phẩm' : 'Hiện sản phẩm'}
              </Button>
            )}
          </>
        }
      />
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_18rem]">
        <Card>
          <form
            className="contents"
            onSubmit={(e) => {
              e.preventDefault();
              const f = Object.fromEntries(new FormData(e.currentTarget));
              update.mutate({
                name: f.name,
                description: f.description || null,
                weight: Number(f.weight),
              });
            }}
          >
            <CardHeader>
              <CardTitle>Thông tin cơ bản</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-[8rem_1fr]">
              <ItemImage className="size-32" />
              <div className="grid content-start gap-4">
                <Field
                  label="Tên sản phẩm"
                  name="name"
                  defaultValue={i.name}
                  required
                />
                <Field
                  label="Cân nặng (g)"
                  name="weight"
                  type="number"
                  min={1}
                  className="w-40"
                  defaultValue={i.weight}
                  required
                />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="description">Mô tả</Label>
                <Textarea
                  id="description"
                  name="description"
                  rows={5}
                  defaultValue={i.description ?? ''}
                />
              </div>
            </CardContent>
            <CardFooter className="justify-end">
              <Button type="submit" disabled={update.isPending}>
                Lưu thay đổi
              </Button>
            </CardFooter>
          </form>
        </Card>

        <Card className="lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle>Tổng quan</CardTitle>
            <CardAction>
              <Badge variant={i.status === 'active' ? 'default' : 'secondary'}>
                {ITEM_STATUS[i.status]}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {(
              [
                ['Giá', priceRange(Math.min(...prices), Math.max(...prices))],
                ['Phân loại', i.models.length],
                ['Có thể bán', sum('stock')],
                ['Tồn kho', sum('onHand')],
                ['Đang giữ cho đơn', sum('reserved')],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3">
                <span className="text-muted-foreground">{label}</span>
                <span className="tabular-nums">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Phân loại, giá và kho hàng</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phân loại</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Giá</TableHead>
                  <TableHead className="text-right">Có thể bán</TableHead>
                  <TableHead className="text-right">Tồn kho</TableHead>
                  <TableHead className="text-right">Đang giữ</TableHead>
                  <TableHead className="text-right">Điều chỉnh kho</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {i.models.map((m) => (
                  <ModelRow
                    key={`${m.id}:${m.price}:${m.sku}:${m.onHand}`}
                    itemId={i.id}
                    model={m}
                    label={
                      m.tierIndex
                        .map((o, t) => i.tierVariations[t].options[o])
                        .join(', ') || 'Mặc định'
                    }
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
