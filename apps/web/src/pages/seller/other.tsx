import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, FileDown, Upload, Wallet } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  ErrorMessage,
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
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { OrderDetail, OrderTable } from '@/pages/buyer';
import { api, download } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import { useInfiniteQuery } from '@tanstack/react-query';

interface ImportResult {
  created: number;
  failed: number;
  results: {
    parentSku: string;
    rows: number[];
    status: 'created' | 'failed';
    error?: string;
  }[];
}

export function ImportCsv() {
  const queryClient = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const upload = useMutation({
    mutationFn: (picked: File) => {
      const form = new FormData();
      form.append('file', picked);
      return api<ImportResult>('/items/imports', { method: 'POST', form });
    },
    onSuccess: () => {
      setOpen(true);
      void queryClient.invalidateQueries({ queryKey: ['my-items'] });
    },
  });
  const save = useMutation({
    mutationFn: async ({ path, name }: { path: string; name: string }) => {
      const url = URL.createObjectURL(await download(path));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  return (
    <>
      <Button
        variant="outline"
        disabled={save.isPending}
        onClick={() =>
          save.mutate({
            path: '/items/imports/template',
            name: 'mau-san-pham.csv',
          })
        }
      >
        <FileDown />
        File mẫu
      </Button>
      <Button
        variant="outline"
        disabled={save.isPending}
        onClick={() =>
          save.mutate({ path: '/items/imports/export', name: 'san-pham.csv' })
        }
      >
        <Download />
        Tải
      </Button>
      <input
        ref={file}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(e) => {
          const picked = e.target.files?.[0];
          e.target.value = '';
          if (picked) upload.mutate(picked);
        }}
      />
      <Button
        variant="outline"
        disabled={upload.isPending}
        onClick={() => file.current?.click()}
      >
        <Upload />
        {upload.isPending ? 'Đang nhập…' : 'Nhập'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {upload.data?.created ?? 0} thành công ·{' '}
              {upload.data?.failed ?? 0} lỗi
            </DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dòng</TableHead>
                <TableHead>Mã sản phẩm</TableHead>
                <TableHead>Kết quả</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {upload.data?.results.map((r) => (
                <TableRow key={r.rows.join()}>
                  <TableCell>{r.rows.join(', ')}</TableCell>
                  <TableCell>{r.parentSku}</TableCell>
                  <TableCell>
                    {r.status === 'created' ? (
                      <Badge>Đã tạo</Badge>
                    ) : (
                      <span className="text-destructive">{r.error}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <DialogFooter>
            <DialogClose asChild>
              <Button>Đóng</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SellerOrdersPage() {
  return (
    <>
      <PageHeader title="Đơn hàng" />
      <OrderTable party="seller" />
    </>
  );
}

export function SellerOrderPage() {
  return (
    <OrderDetail
      backTo="/account/seller/orders"
      actions={(o) =>
        o.status === 'to_ship' && !o.shipment
          ? [
              { label: 'Chuẩn bị hàng', path: 'ship' },
              { label: 'Hủy đơn', path: 'cancel', variant: 'outline' },
            ]
          : []
      }
    />
  );
}

interface WalletPage {
  balance: number;
  items: {
    id: string;
    amount: number;
    refType: string;
    refId: string;
    createdAt: string;
  }[];
  nextCursor: string | null;
}

export function ShopWallet() {
  const wallet = useInfiniteQuery({
    queryKey: ['wallet'],
    queryFn: ({ pageParam }) =>
      api<WalletPage>(
        pageParam ? `/shops/me/wallet?cursor=${pageParam}` : '/shops/me/wallet',
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  if (wallet.isPending) return <Loading />;
  if (wallet.error) return <ErrorMessage error={wallet.error} />;
  const lines = wallet.data.pages.flatMap((p) => p.items);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="size-4 text-muted-foreground" />
          Ví
        </CardTitle>
        <CardAction className="text-right">
          <p className="text-xs text-muted-foreground">Số dư</p>
          <p className="text-xl font-medium text-primary tabular-nums">
            {money(wallet.data.pages[0].balance)}
          </p>
        </CardAction>
      </CardHeader>
      <CardContent>
        {!lines.length ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Chưa có giao dịch
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Thời gian</TableHead>
                <TableHead>Đơn hàng</TableHead>
                <TableHead className="text-right">Số tiền</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{dateTime(l.createdAt)}</TableCell>
                  <TableCell className="font-mono text-xs">{l.refId}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(l.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <LoadMore
          hasMore={wallet.hasNextPage}
          loading={wallet.isFetchingNextPage}
          onClick={() => void wallet.fetchNextPage()}
        />
      </CardContent>
    </Card>
  );
}
