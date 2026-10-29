import type { Review } from '@marketplace/db';

export const reviewView = (r: Review) => ({
  id: r.id,
  rating: r.rating,
  comment: r.comment,
  editedAt: r.editedAt,
  sellerReply: r.sellerReply,
  repliedAt: r.repliedAt,
  createdAt: r.createdAt,
});

// One decimal, as shown on product pages; null until the first review.
export const ratingView = (r: { ratingCount: number; ratingSum: number }) => ({
  ratingCount: r.ratingCount,
  rating: r.ratingCount
    ? Math.round((r.ratingSum * 10) / r.ratingCount) / 10
    : null,
});
