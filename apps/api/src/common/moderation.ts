import type { Prisma } from '@marketplace/db';

// Newest first, for the admin's view of a user or shop.
export const moderationHistory = {
  select: {
    id: true,
    status: true,
    reason: true,
    createdAt: true,
    actor: { select: { id: true, username: true } },
  },
  orderBy: { createdAt: 'desc' },
  take: 50,
} satisfies Prisma.User$moderationsArgs;

// The reason given with the latest action that set this status.
export async function latestReason(
  db: Prisma.TransactionClient,
  target: { userId: string } | { shopId: string },
  status: string,
) {
  const action = await db.moderationAction.findFirst({
    where: { ...target, status },
    orderBy: { createdAt: 'desc' },
    select: { reason: true },
  });
  return action?.reason ?? null;
}
