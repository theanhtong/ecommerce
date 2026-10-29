import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Empty, ErrorMessage, Loading, PageHeader } from '@/components/common';
import { ConfirmButton } from '@/components/confirm-button';
import { SalePrice } from '@/components/flash-sale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import type { FlashSale, ItemDetail, ItemSummary, Page } from '@/lib/types';
import { Field } from '@/pages/account';

const PATH = '/shops/me/flash-sales';
const HOUR_MS = 60 * 60 * 1000;

const phase = (s: FlashSale, now = Date.now()) =>
  now < Date.parse(s.startsAt)
    ? (['Sắp diễn ra', 'secondary'] as const)
    : now < Date.parse(s.endsAt)
      ? (['Đang diễn ra', 'default'] as const)
      : (['Đã kết thúc', 'outline'] as const);

const localInput = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);

const modelName = (item: ItemDetail, tierIndex: number[]) =>
  tierIndex.map((o, t) => item.tierVariations[t]?.options[o]).join(', ') ||
  item.name;

type Row = { on: boolean; price: string; quota: string; limit: string };

const INPUT_LABEL = {
  price: 'Giá sốc',
  quota: 'Số suất',
  limit: 'Mỗi người',
};

function NewFlashSale() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [itemId, setItemId] = useState<string>();
  const [rows, setRows] = useState<Record<string, Row>>({});
  const items = useQuery({
    queryKey: ['my-items', 'all'],
    queryFn: () => api<Page<ItemSummary>>('/items/mine?limit=100'),
    enabled: open,
  });
  const item = useQuery({
    queryKey: ['my-item', itemId],
    queryFn: () => api<ItemDetail>(`/items/mine/${itemId}`),
    enabled: !!itemId,
  });
  const create = useMutation({
    mutationFn: (body: object) =>
      api<FlashSale>(PATH, { method: 'POST', body }),
    onSuccess: () => {
      toast.success('Đã tạo giá sốc');
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: [PATH] });
    },
  });
  const row = (id: string): Row =>
    rows[id] ?? { on: false, price: '', quota: '', limit: '1' };
  const update = (id: string, change: Partial<Row>) =>
    setRows({ ...rows, [id]: { ...row(id), ...change } });
  const picked = Object.entries(rows).filter(([, r]) => r.on);
  const [now, setNow] = useState(() => new Date());

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setNow(new Date());
          setItemId(undefined);
          setRows({});
          create.reset();
        }
      }}
    >
      <Button onClick={() => setOpen(true)}>
        <Plus />
        Tạo giá sốc
      </Button>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tạo giá sốc</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = Object.fromEntries(
              new FormData(e.currentTarget),
            ) as Record<string, string>;
            create.mutate({
              name: f.name,
              startsAt: new Date(f.startsAt).toISOString(),
              endsAt: new Date(f.endsAt).toISOString(),
              models: picked.map(([modelId, r]) => ({
                modelId,
                price: Number(r.price),
                quota: Number(r.quota),
                purchaseLimit: Number(r.limit),
              })),
            });
          }}
        >
          <Field label="Tên" name="name" required maxLength={100} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Bắt đầu"
              name="startsAt"
              type="datetime-local"
              defaultValue={localInput(now)}
              required
            />
            <Field
              label="Kết thúc"
              name="endsAt"
              type="datetime-local"
              defaultValue={localInput(new Date(now.getTime() + 2 * HOUR_MS))}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label>Sản phẩm</Label>
            <Select
              value={itemId}
              onValueChange={(id) => {
                setItemId(id);
                setRows({});
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Chọn sản phẩm" />
              </SelectTrigger>
              <SelectContent>
                {items.data?.items.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {item.data && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead>Phân loại</TableHead>
                  <TableHead>Giá gốc</TableHead>
                  <TableHead>Giá sốc</TableHead>
                  <TableHead>Số suất</TableHead>
                  <TableHead>Mỗi người</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {item.data.models.map((m) => {
                  const r = row(m.id);
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        <Checkbox
                          aria-label={modelName(item.data, m.tierIndex)}
                          checked={r.on}
                          disabled={m.stock === 0}
                          onCheckedChange={(on) =>
                            update(m.id, { on: on === true })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        {modelName(item.data, m.tierIndex)}
                        <p className="text-xs text-muted-foreground">
                          Tồn kho {m.stock}
                        </p>
                      </TableCell>
                      <TableCell>
                        <SalePrice price={m.price} />
                      </TableCell>
                      {(['price', 'quota', 'limit'] as const).map((key) => (
                        <TableCell key={key}>
                          <Input
                            type="number"
                            min={1}
                            max={
                              key === 'price'
                                ? m.price - 1
                                : key === 'quota'
                                  ? m.stock
                                  : undefined
                            }
                            className="w-24"
                            aria-label={INPUT_LABEL[key]}
                            disabled={!r.on}
                            required={r.on}
                            value={r[key]}
                            onChange={(e) =>
                              update(m.id, { [key]: e.target.value })
                            }
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {create.error && <ErrorMessage error={create.error} />}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Hủy
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!picked.length || create.isPending}>
              Tạo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SellerFlashSalesPage() {
  const queryClient = useQueryClient();
  const sales = useQuery({
    queryKey: [PATH],
    queryFn: () => api<FlashSale[]>(PATH),
  });
  const end = useMutation({
    mutationFn: (id: string) => api(`${PATH}/${id}/end`, { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [PATH] }),
  });

  return (
    <>
      <PageHeader title="Giá sốc" actions={<NewFlashSale />} />
      {sales.isPending ? (
        <Loading />
      ) : sales.error ? (
        <ErrorMessage error={sales.error} />
      ) : !sales.data.length ? (
        <Empty>Chưa có giá sốc</Empty>
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Chương trình</TableHead>
                  <TableHead>Sản phẩm</TableHead>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.data.map((s) => {
                  const [label, variant] = phase(s);
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>
                        {s.models.map((m) => (
                          <p key={m.id} className="text-sm">
                            {m.itemName}
                            {m.variation && ` · ${m.variation}`}:{' '}
                            <SalePrice
                              price={m.price}
                              originalPrice={m.originalPrice}
                            />{' '}
                            <span className="text-muted-foreground tabular-nums">
                              ({m.sold}/{m.quota})
                            </span>
                          </p>
                        ))}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {dateTime(s.startsAt)}
                        <br />
                        {dateTime(s.endsAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={variant}>{label}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {label !== 'Đã kết thúc' && (
                          <ConfirmButton
                            label="Kết thúc"
                            variant="outline"
                            title={`Kết thúc ${s.name}?`}
                            description={dateTime(s.endsAt)}
                            pending={end.isPending}
                            onConfirm={() => end.mutate(s.id)}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
