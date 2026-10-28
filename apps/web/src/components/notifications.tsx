import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api';
import { dateTime, NOTIFICATION_TYPE } from '@/lib/format';
import type { Notification, Page } from '@/lib/types';
import { cn } from '@/lib/utils';

const orderPath = (n: Notification) =>
  n.audience === 'buyer'
    ? `/orders/${n.orderId}`
    : `/seller/orders/${n.orderId}`;

export function NotificationBell() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const inbox = useQuery({
    queryKey: ['notifications'],
    queryFn: () =>
      api<Page<Notification> & { unread: number }>('/notifications?limit=10'),
    refetchInterval: 30_000,
  });
  const read = useMutation({
    mutationFn: (id?: string) =>
      api(id ? `/notifications/${id}/read` : '/notifications/read', {
        method: 'POST',
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const unread = inbox.data?.unread ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-primary px-1 text-[10px] leading-4 text-primary-foreground">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between">
          <DropdownMenuLabel>Thông báo</DropdownMenuLabel>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              disabled={read.isPending}
              onClick={() => read.mutate(undefined)}
            >
              Đánh dấu đã đọc
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        {inbox.data?.items.length ? (
          inbox.data.items.map((n) => (
            <DropdownMenuItem
              key={n.id}
              className="grid gap-0.5"
              onSelect={() => {
                if (!n.readAt) read.mutate(n.id);
                void navigate(orderPath(n));
              }}
            >
              <span className={cn(!n.readAt && 'font-medium')}>
                {NOTIFICATION_TYPE[n.type]}
              </span>
              <span className="text-xs text-muted-foreground">
                {n.orderId.slice(-8).toUpperCase()} · {dateTime(n.createdAt)}
              </span>
            </DropdownMenuItem>
          ))
        ) : (
          <div className="px-2 py-6 text-center text-sm text-muted-foreground">
            Chưa có thông báo
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
