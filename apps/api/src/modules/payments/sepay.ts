import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_CLOCK_SKEW_S = 5 * 60;

export interface SepayTransfer {
  id: number;
  transferType: 'in' | 'out';
  transferAmount: number;
  content: string;
  code: string | null;
  referenceCode: string | null;
}

// The provider signs `${timestamp}.${raw body}`; old timestamps are refused so a captured
// request cannot be replayed later.
export function verifySignature(
  secret: string,
  rawBody: Buffer,
  signature: string | undefined,
  timestamp: string | undefined,
  now = Date.now(),
) {
  const sentAt = Number(timestamp);
  if (!signature || !Number.isInteger(sentAt)) return false;
  if (Math.abs(now / 1000 - sentAt) > MAX_CLOCK_SKEW_S) return false;
  const expected = Buffer.from(
    `sha256=${createHmac('sha256', secret)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest('hex')}`,
  );
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function parseTransfer(body: unknown): SepayTransfer | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (
    !Number.isSafeInteger(b.id) ||
    (b.transferType !== 'in' && b.transferType !== 'out') ||
    !Number.isSafeInteger(b.transferAmount) ||
    (b.transferAmount as number) <= 0 ||
    typeof b.content !== 'string'
  ) {
    return null;
  }
  return {
    id: b.id as number,
    transferType: b.transferType,
    transferAmount: b.transferAmount as number,
    content: b.content,
    code: typeof b.code === 'string' ? b.code : null,
    referenceCode:
      typeof b.referenceCode === 'string' && b.referenceCode
        ? b.referenceCode
        : null,
  };
}
