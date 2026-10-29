import { ChevronRight, Store, TicketPercent, Truck } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { dateTime, money, voucherTerms } from '@/lib/format';
import type { Voucher } from '@/lib/types';

const ICON = {
  shop_voucher: Store,
  platform_voucher: TicketPercent,
  shipping_voucher: Truck,
};

// base is the amount each voucher's minimum spend is checked against. A locked list shows what
// the system applied and cannot be changed.
function VoucherList({
  vouchers,
  base,
  value,
  onChange,
  locked,
}: {
  vouchers: Voucher[];
  base: number;
  value?: string;
  onChange?: (code: string) => void;
  locked?: boolean;
}) {
  const usable = (v: Voucher) => base >= v.minSpend;
  const sorted = [...vouchers].sort(
    (a, b) =>
      Number(b.code === value) - Number(a.code === value) ||
      Number(usable(b)) - Number(usable(a)),
  );
  return (
    <RadioGroup value={value ?? ''} onValueChange={onChange} className="gap-3">
      {sorted.map((v) => {
        const Icon = ICON[v.type];
        const ok = usable(v);
        return (
          <Label
            key={v.code}
            className={`flex items-stretch gap-0 overflow-hidden rounded-md border p-0 font-normal has-data-[state=checked]:border-primary ${
              v.code !== value && (locked || !ok) ? 'opacity-60' : ''
            }`}
          >
            <span className="grid w-20 shrink-0 place-items-center border-r border-dashed bg-primary/10 text-primary">
              <Icon className="size-6" />
            </span>
            <span className="grid flex-1 gap-1 p-3">
              <span className="font-medium">
                {voucherTerms({ ...v, minSpend: 0 })}
              </span>
              <span className="text-xs text-muted-foreground">
                {v.minSpend
                  ? `Đơn tối thiểu ${money(v.minSpend)}`
                  : 'Không yêu cầu đơn tối thiểu'}
              </span>
              <span className="text-xs text-muted-foreground">
                HSD: {dateTime(v.endsAt)}
              </span>
              {!ok && (
                <span className="text-xs text-destructive">
                  Mua thêm {money(v.minSpend - base)} để dùng
                </span>
              )}
            </span>
            <RadioGroupItem
              value={v.code}
              disabled={locked || !ok}
              className="m-3 self-center"
            />
          </Label>
        );
      })}
    </RadioGroup>
  );
}

function PickerButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full justify-start font-normal"
      onClick={onClick}
    >
      <TicketPercent className="text-primary" />
      <span className="text-muted-foreground">{label}</span>
      <ChevronRight className="text-muted-foreground" />
    </Button>
  );
}

interface Choice {
  vouchers: Voucher[];
  base: number;
  value?: string;
  onChange: (code?: string) => void;
}

// Every voucher of a checkout behind one row: each shop's and the platform's, which the buyer picks,
// and the free-shipping one the server applies. Sections without vouchers are left out, and the row
// too when all are.
export function CheckoutVoucherPicker({
  shops,
  platform,
  shipping,
}: {
  shops: (Choice & { name: string })[];
  platform: Choice;
  shipping: { vouchers: Voucher[]; base: number; applied: string | null };
}) {
  const [open, setOpen] = useState(false);
  const choices: [string, Choice][] = [
    ...shops.map((s) => [`Mã giảm giá của ${s.name}`, s] as [string, Choice]),
    ['Mã giảm giá của sàn', platform],
  ];
  if (
    !shipping.vouchers.length &&
    choices.every(([, c]) => !c.vouchers.length)
  ) {
    return null;
  }

  return (
    <>
      <PickerButton label="Mã giảm giá" onClick={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mã giảm giá</DialogTitle>
          </DialogHeader>
          {choices
            .filter(([, c]) => c.vouchers.length)
            .map(([title, c]) => (
              <section key={title} className="grid gap-3">
                <h3 className="flex items-center justify-between text-sm font-medium">
                  {title}
                  {c.value && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => c.onChange(undefined)}
                    >
                      Bỏ chọn
                    </Button>
                  )}
                </h3>
                <VoucherList
                  vouchers={c.vouchers}
                  base={c.base}
                  value={c.value}
                  onChange={c.onChange}
                />
              </section>
            ))}
          {shipping.vouchers.length > 0 && (
            <section className="grid gap-3">
              <h3 className="text-sm font-medium">Miễn phí vận chuyển</h3>
              <VoucherList
                vouchers={shipping.vouchers}
                base={shipping.base}
                value={shipping.applied ?? undefined}
                locked
              />
            </section>
          )}
          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Xong</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
