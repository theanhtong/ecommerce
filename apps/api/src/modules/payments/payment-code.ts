import { randomInt } from 'node:crypto';

const PREFIX = 'MKP';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE = new RegExp(`${PREFIX}[${ALPHABET}]{8}`);

// Assumption: a buyer has 24 hours to transfer the money before the orders are cancelled.
export const PAYMENT_WINDOW_MS = 24 * 60 * 60 * 1000;

// Without 0/O and 1/I, so a code typed by hand into a banking app still matches.
export const paymentCode = () =>
  PREFIX +
  Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(
    '',
  );

// Banks may reflow the transfer note, so the code is searched for anywhere in it.
export const findPaymentCode = (text: string) =>
  CODE.exec(text.toUpperCase())?.[0] ?? null;
