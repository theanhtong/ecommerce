import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Empty, ErrorMessage, Loading, PageHeader } from '@/components/common';
import { ConfirmButton } from '@/components/confirm-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { dateTime, VOUCHER_TYPE, voucherTerms } from '@/lib/format';
import type { Voucher, VoucherType } from '@/lib/types';
import { Field } from '@/pages/account';

const phase = (v: Voucher, now = Date.now()) =>
  now < Date.parse(v.startsAt)
    ? (['Sắp diễn ra', 'secondary'] as const)
    : now < Date.parse(v.endsAt)
      ? (['Đang diễn ra', 'default'] as const)
      : (['Đã kết thúc', 'outline'] as const);

// datetime-local wants local time without a zone.
const localInput = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);

function Choice<T extends string>({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: [T, string][];
}) {
  return (
    <RadioGroup
      name={name}
      value={value}
      onValueChange={(v) => onChange(v as T)}
      className="flex flex-wrap gap-2"
    >
      {options.map(([v, label]) => (
        <Label
          key={v}
          className="flex items-center gap-2 rounded-md border px-3 py-2 font-normal has-data-[state=checked]:border-primary"
        >
          <RadioGroupItem value={v} />
          {label}
        </Label>
      ))}
    </RadioGroup>
  );
}

function NewVoucher({
  path,
  types,
}: {
  path: string;
  types?: Exclude<VoucherType, 'shop_voucher'>[];
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(types?.[0]);
  const [kind, setKind] = useState<'fixed' | 'percent'>('fixed');
  const create = useMutation({
    mutationFn: (body: object) => api<Voucher>(path, { method: 'POST', body }),
    onSuccess: () => {
      toast.success('Đã tạo voucher');
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: [path] });
    },
  });
  const now = new Date();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        create.reset();
      }}
    >
      <Button onClick={() => setOpen(true)}>
        <Plus />
        Tạo voucher
      </Button>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tạo voucher</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = Object.fromEntries(
              new FormData(e.currentTarget),
            ) as Record<string, string>;
            create.mutate({
              ...(type && { type }),
              code: f.code,
              name: f.name,
              discountKind: kind,
              discountValue: Number(f.discountValue),
              ...(kind === 'percent' &&
                f.maxDiscount && { maxDiscount: Number(f.maxDiscount) }),
              minSpend: Number(f.minSpend || 0),
              usageLimit: Number(f.usageLimit),
              startsAt: new Date(f.startsAt).toISOString(),
              endsAt: new Date(f.endsAt).toISOString(),
            });
          }}
        >
          {types && type && (
            <Choice
              name="type"
              value={type}
              onChange={setType}
              options={types.map((t) => [t, VOUCHER_TYPE[t]])}
            />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Mã" name="code" required maxLength={20} />
            <Field label="Tên" name="name" required maxLength={100} />
          </div>
          <Choice
            name="discountKind"
            value={kind}
            onChange={setKind}
            options={[
              ['fixed', 'Giảm số tiền'],
              ['percent', 'Giảm theo %'],
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={kind === 'fixed' ? 'Mức giảm (₫)' : 'Mức giảm (%)'}
              name="discountValue"
              type="number"
              min={1}
              max={kind === 'percent' ? 100 : undefined}
              required
            />
            {kind === 'percent' && (
              <Field
                label="Giảm tối đa (₫)"
                name="maxDiscount"
                type="number"
                min={1}
              />
            )}
            <Field
              label="Đơn tối thiểu (₫)"
              name="minSpend"
              type="number"
              min={0}
              defaultValue={0}
            />
            <Field
              label="Số lượt"
              name="usageLimit"
              type="number"
              min={1}
              required
            />
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
              defaultValue={localInput(
                new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
              )}
              required
            />
          </div>
          {create.error && <ErrorMessage error={create.error} />}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Hủy
              </Button>
            </DialogClose>
            <Button type="submit" disabled={create.isPending}>
              Tạo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VoucherManager({
  path,
  types,
}: {
  path: string;
  types?: Exclude<VoucherType, 'shop_voucher'>[];
}) {
  const queryClient = useQueryClient();
  const vouchers = useQuery({
    queryKey: [path],
    queryFn: () => api<Voucher[]>(path),
  });
  const end = useMutation({
    mutationFn: (id: string) => api(`${path}/${id}/end`, { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [path] }),
  });

  return (
    <>
      <PageHeader
        title="Khuyến mãi"
        actions={<NewVoucher path={path} types={types} />}
      />
      {vouchers.isPending ? (
        <Loading />
      ) : vouchers.error ? (
        <ErrorMessage error={vouchers.error} />
      ) : !vouchers.data.length ? (
        <Empty>Chưa có voucher</Empty>
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Voucher</TableHead>
                  <TableHead>Ưu đãi</TableHead>
                  <TableHead className="text-right">Đã dùng</TableHead>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {vouchers.data.map((v) => {
                  const [label, variant] = phase(v);
                  return (
                    <TableRow key={v.id}>
                      <TableCell>
                        <p className="font-mono font-medium">{v.code}</p>
                        <p className="text-xs text-muted-foreground">
                          {v.name}
                          {types && ` · ${VOUCHER_TYPE[v.type]}`}
                        </p>
                      </TableCell>
                      <TableCell>{voucherTerms(v)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {v.usedCount}/{v.usageLimit}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {dateTime(v.startsAt)}
                        <br />
                        {dateTime(v.endsAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={variant}>{label}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {label !== 'Đã kết thúc' && (
                          <ConfirmButton
                            label="Kết thúc"
                            variant="outline"
                            title={`Kết thúc voucher ${v.code}?`}
                            description={v.name}
                            pending={end.isPending}
                            onConfirm={() => end.mutate(v.id)}
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

export const SellerVouchersPage = () => (
  <VoucherManager path="/shops/me/vouchers" />
);

export const AdminVouchersPage = () => (
  <VoucherManager
    path="/admin/vouchers"
    types={['platform_voucher', 'shipping_voucher']}
  />
);
