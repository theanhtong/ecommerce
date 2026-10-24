import { useQuery } from '@tanstack/react-query';
import { CircleCheck, Copy, TimerOff } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { ErrorMessage, Loading, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';
import { dateTime, money } from '@/lib/format';

interface Payment {
  id: string;
  checkoutId: string;
  code: string;
  amount: number;
  status: 'pending' | 'paid' | 'expired';
  expiresAt: string;
  paidAt: string | null;
  bank: string;
  accountNumber: string;
  qrUrl: string;
}

function CopyRow({
  label,
  value,
  shown = value,
}: {
  label: string;
  value: string;
  shown?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-3 last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-1 font-medium tabular-nums">
        {shown}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Sao chép ${label.toLowerCase()}`}
          onClick={() =>
            void navigator.clipboard
              .writeText(value)
              .then(() => toast.success('Đã sao chép'))
          }
        >
          <Copy />
        </Button>
      </dd>
    </div>
  );
}

export function PaymentPage() {
  const { id } = useParams();
  const payment = useQuery({
    queryKey: ['payment', id],
    queryFn: () => api<Payment>(`/checkouts/${id}/payment`),
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 3000 : false),
  });

  if (payment.isPending) return <Loading />;
  if (payment.error) return <ErrorMessage error={payment.error} />;
  const p = payment.data;

  if (p.status !== 'pending') {
    const paid = p.status === 'paid';
    const Icon = paid ? CircleCheck : TimerOff;
    return (
      <Card className="mx-auto max-w-md">
        <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
          <Icon
            className={`size-10 ${paid ? 'text-primary' : 'text-muted-foreground'}`}
          />
          <p className="text-lg font-medium">
            {paid ? 'Đã thanh toán' : 'Hết hạn thanh toán'}
          </p>
          <p className="text-2xl font-medium tabular-nums">{money(p.amount)}</p>
          <Button asChild variant="outline">
            <Link to="/orders">Xem đơn mua</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <PageHeader title="Chuyển khoản ngân hàng" />
      <Card className="mx-auto max-w-3xl">
        <CardContent className="grid items-center gap-6 md:grid-cols-[16rem_1fr]">
          <img
            src={p.qrUrl}
            alt={`Mã QR chuyển ${money(p.amount)}`}
            className="mx-auto aspect-square w-64 rounded-lg border bg-white p-2"
          />
          <dl>
            <div className="flex items-center justify-between gap-3 border-b py-3">
              <dt className="text-sm text-muted-foreground">Ngân hàng</dt>
              <dd className="font-medium">{p.bank}</dd>
            </div>
            <CopyRow label="Số tài khoản" value={p.accountNumber} />
            <CopyRow
              label="Số tiền"
              value={String(p.amount)}
              shown={money(p.amount)}
            />
            <CopyRow label="Nội dung" value={p.code} />
            <div className="flex items-center justify-between gap-3 py-3">
              <dt className="text-sm text-muted-foreground">Hạn thanh toán</dt>
              <dd className="font-medium">{dateTime(p.expiresAt)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </>
  );
}
