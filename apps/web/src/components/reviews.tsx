import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Empty, ErrorMessage, Loading, Pager } from '@/components/common';
import { Filter } from '@/components/report';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { dateTime } from '@/lib/format';
import { usePaged } from '@/lib/queries';
import type { ListedReview, Order, Review } from '@/lib/types';
import { cn } from '@/lib/utils';

const DAY_MS = 24 * 60 * 60 * 1000;
const REVIEW_WINDOW_MS = 30 * DAY_MS;

type Line = Order['items'][number];
// What the review dialog needs; the product page has it without the whole order.
type ReviewLine = Pick<Line, 'id' | 'itemName' | 'modelName' | 'review'>;

export function Stars({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  return (
    <span
      className={cn('inline-flex gap-0.5', className)}
      role="img"
      aria-label={`${value}/5`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            'size-4',
            n <= Math.round(value)
              ? 'fill-primary text-primary'
              : 'text-muted-foreground/40',
          )}
        />
      ))}
    </span>
  );
}

export function RatingSummary({
  rating,
  count,
}: {
  rating: number | null;
  count: number;
}) {
  if (rating === null) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className="font-medium text-primary">{rating.toFixed(1)}</span>
      <Stars value={rating} />
      <span className="text-muted-foreground">({count})</span>
    </span>
  );
}

function StarInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <Button
          key={n}
          variant="ghost"
          size="icon"
          aria-label={`${n}/5`}
          onClick={() => onChange(n)}
        >
          <Star
            className={cn(
              'size-6',
              n <= value
                ? 'fill-primary text-primary'
                : 'text-muted-foreground/40',
            )}
          />
        </Button>
      ))}
    </div>
  );
}

function ReviewDialog({
  orderId,
  line,
  open,
  onOpenChange,
}: {
  orderId: string;
  line: ReviewLine;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const send = useMutation({
    mutationFn: () =>
      api<Review>(
        line.review
          ? `/reviews/${line.review.id}`
          : `/order-items/${line.id}/review`,
        {
          method: line.review ? 'PATCH' : 'POST',
          body: { rating, ...(comment.trim() && { comment }) },
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      void queryClient.invalidateQueries({ queryKey: ['my-reviews'] });
      void queryClient.invalidateQueries({ queryKey: ['item-reviews'] });
      void queryClient.invalidateQueries({ queryKey: ['item'] });
      onOpenChange(false);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) {
          setRating(line.review?.rating ?? 0);
          setComment(line.review?.comment ?? '');
          send.reset();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {line.review ? 'Sửa đánh giá' : 'Đánh giá sản phẩm'}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm">
          {line.itemName}
          {line.modelName && (
            <span className="text-muted-foreground"> · {line.modelName}</span>
          )}
        </p>
        <StarInput value={rating} onChange={setRating} />
        <Textarea
          aria-label="Nhận xét"
          placeholder="Nhận xét"
          maxLength={1000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        {send.error && <ErrorMessage error={send.error} />}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Đóng</Button>
          </DialogClose>
          <Button
            disabled={!rating || send.isPending}
            onClick={() => send.mutate()}
          >
            Gửi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReplyDialog({
  reviewId,
  invalidate,
  open,
  onOpenChange,
}: {
  reviewId: string;
  invalidate: unknown[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [reply, setReply] = useState('');
  const send = useMutation({
    mutationFn: () =>
      api(`/reviews/${reviewId}/reply`, { method: 'POST', body: { reply } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: invalidate });
      onOpenChange(false);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) {
          setReply('');
          send.reset();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Phản hồi đánh giá</DialogTitle>
        </DialogHeader>
        <Textarea
          aria-label="Phản hồi"
          placeholder="Phản hồi"
          maxLength={500}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
        />
        {send.error && <ErrorMessage error={send.error} />}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Đóng</Button>
          </DialogClose>
          <Button
            disabled={!reply.trim() || send.isPending}
            onClick={() => send.mutate()}
          >
            Gửi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewBody({
  review,
  variation,
}: {
  review: Review;
  variation?: string | null;
}) {
  return (
    <div className="grid gap-2 text-sm">
      <Stars value={review.rating} />
      <p className="text-xs text-muted-foreground">
        {dateTime(review.editedAt ?? review.createdAt)}
        {variation && ` | Phân loại: ${variation}`}
        {review.editedAt && ' | Đã sửa'}
      </p>
      {review.comment && (
        <p className="leading-relaxed whitespace-pre-line">{review.comment}</p>
      )}
      {review.sellerReply && (
        <div className="rounded-md border-l-2 border-primary bg-muted/60 px-3 py-2">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Phản hồi của người bán
          </p>
          <p className="whitespace-pre-line">{review.sellerReply}</p>
        </div>
      )}
    </div>
  );
}

function ReviewCard({
  review,
  title,
  action,
}: {
  review: ListedReview;
  title?: string;
  action?: ReactNode;
}) {
  return (
    <article className="flex gap-3 py-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-sm font-medium uppercase">
        {review.buyer.slice(0, 1)}
      </span>
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-medium">
            {review.buyer}
            {title && (
              <span className="font-normal text-muted-foreground">
                {' '}
                · {title}
              </span>
            )}
          </p>
          {action}
        </div>
        <ReviewBody review={review} variation={review.modelName} />
      </div>
    </article>
  );
}

const NoReviews = () => (
  <p className="py-12 text-center text-sm text-muted-foreground">
    Chưa có đánh giá
  </p>
);

const completedAt = (o: Order) =>
  o.history.find((h) => h.to === 'completed')?.at;

// The review shown under an order line, with the actions open to the viewer.
export function LineReview({
  order,
  line,
  viewer,
}: {
  order: Order;
  line: Line;
  viewer: 'buyer' | 'seller';
}) {
  const [open, setOpen] = useState(false);
  const [now] = useState(() => Date.now());
  const done = completedAt(order);
  const review = line.review;
  const canReview =
    viewer === 'buyer' &&
    !!done &&
    now - new Date(done).getTime() <= REVIEW_WINDOW_MS;
  const canEdit =
    viewer === 'buyer' &&
    !!review &&
    !review.editedAt &&
    now - new Date(review.createdAt).getTime() <= REVIEW_WINDOW_MS;
  const canReply = viewer === 'seller' && !!review && !review.sellerReply;
  if (!review && !canReview) return null;

  return (
    <div className="flex w-full md:col-span-full flex-wrap items-start justify-between gap-2 pt-2">
      {review ? <ReviewBody review={review} /> : <span />}
      {(review ? canEdit : canReview) && (
        <>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            {review ? 'Sửa đánh giá' : 'Đánh giá'}
          </Button>
          <ReviewDialog
            orderId={order.id}
            line={line}
            open={open}
            onOpenChange={setOpen}
          />
        </>
      )}
      {canReply && (
        <>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Phản hồi
          </Button>
          <ReplyDialog
            reviewId={review.id}
            invalidate={['order', order.id]}
            open={open}
            onOpenChange={setOpen}
          />
        </>
      )}
    </div>
  );
}

const RATING_FILTER = {
  all: 'Tất cả',
  s5: '5 sao',
  s4: '4 sao',
  s3: '3 sao',
  s2: '2 sao',
  s1: '1 sao',
} as const;

type MyLine = ReviewLine & { orderId: string };

function MyReview({ line }: { line: MyLine }) {
  const [open, setOpen] = useState(false);
  const [now] = useState(() => Date.now());
  const { review } = line;
  const canEdit =
    !review ||
    (!review.editedAt &&
      now - new Date(review.createdAt).getTime() <= REVIEW_WINDOW_MS);
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 rounded-md border p-3 text-sm">
      <div className="grid gap-1">
        <span className="text-muted-foreground">
          {line.modelName && `Phân loại: ${line.modelName} · `}
          Đơn {line.orderId.slice(-8).toUpperCase()}
        </span>
        {review && <ReviewBody review={review} />}
      </div>
      {canEdit && (
        <>
          <Button
            size="sm"
            variant={review ? 'outline' : 'default'}
            onClick={() => setOpen(true)}
          >
            {review ? 'Sửa đánh giá' : 'Đánh giá'}
          </Button>
          <ReviewDialog
            orderId={line.orderId}
            line={line}
            open={open}
            onOpenChange={setOpen}
          />
        </>
      )}
    </div>
  );
}

function MyReviews({ itemId }: { itemId: string }) {
  const mine = useQuery({
    queryKey: ['my-reviews', itemId],
    queryFn: () => api<MyLine[]>(`/items/${itemId}/reviews/mine`),
  });
  if (!mine.data?.length) return null;
  return (
    <div className="mb-4 grid gap-2">
      <p className="font-medium">Đánh giá của bạn</p>
      {mine.data.map((line) => (
        <MyReview key={line.id} line={line} />
      ))}
    </div>
  );
}

export function ItemReviews({
  itemId,
  rating,
  count,
}: {
  itemId: string;
  rating: number | null;
  count: number;
}) {
  const { user } = useAuth();
  const [filter, setFilter] = useState<keyof typeof RATING_FILTER>('all');
  const path =
    filter === 'all'
      ? `/items/${itemId}/reviews`
      : `/items/${itemId}/reviews?rating=${filter.slice(1)}`;
  const page = usePaged<ListedReview>(['item-reviews', itemId, filter], path);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-3">
          Đánh giá sản phẩm
          <RatingSummary rating={rating} count={count} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {user?.role === 'user' && <MyReviews itemId={itemId} />}
        <Filter labels={RATING_FILTER} value={filter} onChange={setFilter} />
        <div
          className={cn(
            'min-h-40 transition-opacity',
            page.isPlaceholderData && 'opacity-50',
          )}
        >
          {page.isPending ? (
            <Loading />
          ) : page.error ? (
            <ErrorMessage error={page.error} />
          ) : !page.items.length ? (
            <NoReviews />
          ) : (
            <div className="divide-y">
              {page.items.map((r) => (
                <ReviewCard key={r.id} review={r} />
              ))}
            </div>
          )}
        </div>
        <Pager page={page.page} prev={page.prev} next={page.next} />
      </CardContent>
    </Card>
  );
}

const REPLY_FILTER = {
  false: 'Chưa phản hồi',
  true: 'Đã phản hồi',
} as const;

export function ShopReviews() {
  const [replied, setReplied] = useState<keyof typeof REPLY_FILTER>('false');
  const [replying, setReplying] = useState<string>();
  const key = ['shop-reviews', replied];
  const page = usePaged<ListedReview>(
    key,
    `/shops/me/reviews?replied=${replied}`,
  );

  return (
    <>
      <Filter labels={REPLY_FILTER} value={replied} onChange={setReplied} />
      {page.isPending ? (
        <Loading />
      ) : page.error ? (
        <ErrorMessage error={page.error} />
      ) : !page.items.length ? (
        <Empty>Chưa có đánh giá</Empty>
      ) : (
        <Card
          className={cn(
            'transition-opacity',
            page.isPlaceholderData && 'opacity-50',
          )}
        >
          <CardContent className="divide-y">
            {page.items.map((r) => (
              <ReviewCard
                key={r.id}
                review={r}
                title={r.item?.name}
                action={
                  <div className="flex shrink-0 gap-2">
                    {r.item && (
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/items/${r.item.id}`}>Xem sản phẩm</Link>
                      </Button>
                    )}
                    {!r.sellerReply && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setReplying(r.id)}
                      >
                        Phản hồi
                      </Button>
                    )}
                  </div>
                }
              />
            ))}
          </CardContent>
        </Card>
      )}
      <Pager page={page.page} prev={page.prev} next={page.next} />
      {replying && (
        <ReplyDialog
          reviewId={replying}
          invalidate={['shop-reviews']}
          open
          onOpenChange={(open) => !open && setReplying(undefined)}
        />
      )}
    </>
  );
}
