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

// base is the amount the voucher's minimum spend is checked against; discount is what the
// server applied for the picked one.
export function VoucherPicker({
  label,
  vouchers,
  base,
  discount,
  value,
  onChange,
  locked,
}: {
  label: string;
  vouchers: Voucher[];
  base: number;
  discount: number;
  value?: string;
  onChange: (code?: string) => void;
  // Applied by the system and not changeable: shown as a disabled row with this text.
  locked?: string;
}) {
  const [open, setOpen] = useState(false);
  if (locked !== undefined) {
    return (
      <Button
        type="button"
        variant="outline"
        disabled
        className="w-full justify-start font-normal disabled:opacity-80"
      >
        <TicketPercent className="text-primary" />
        <span className="text-muted-foreground">{label}</span>
        <span className="ml-auto truncate font-medium">{locked}</span>
      </Button>
    );
  }
  if (!vouchers.length) return null;
  const choose = (code?: string) => {
    onChange(code);
    setOpen(false);
  };
  const usable = (v: Voucher) => base >= v.minSpend;
  const sorted = [...vouchers].sort(
    (a, b) => Number(usable(b)) - Number(usable(a)),
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-full justify-start font-normal"
        onClick={() => setOpen(true)}
      >
        <TicketPercent className="text-primary" />
        <span className="text-muted-foreground">{label}</span>
        <span className="ml-auto truncate">
          {value ? (
            <span className="font-medium text-primary">
              {discount ? `-${money(discount)}` : value}
            </span>
          ) : (
            'Chọn voucher'
          )}
        </span>
        <ChevronRight className="text-muted-foreground" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>
          <RadioGroup
            value={value ?? ''}
            onValueChange={choose}
            className="gap-3"
          >
            {sorted.map((v) => {
              const Icon = ICON[v.type];
              const ok = usable(v);
              return (
                <Label
                  key={v.code}
                  className="flex items-stretch gap-0 overflow-hidden rounded-md border p-0 font-normal has-data-[state=checked]:border-primary has-disabled:opacity-60"
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
                    disabled={!ok}
                    className="m-3 self-center"
                  />
                </Label>
              );
            })}
          </RadioGroup>
          {value && (
            <DialogFooter>
              <Button variant="outline" onClick={() => choose(undefined)}>
                Bỏ chọn
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
