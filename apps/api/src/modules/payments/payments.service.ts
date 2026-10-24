import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentStatus, Prisma } from '@ecommerce/db';
import { PrismaService } from '../../prisma/prisma.service.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { OrdersService } from '../orders/orders.service.js';
import { findPaymentCode } from './payment-code.js';
import type { SepayTransfer } from './sepay.js';

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

@Injectable()
export class PaymentsService {
  readonly webhookSecret = required('SEPAY_WEBHOOK_SECRET');
  private readonly bank = required('SEPAY_BANK');
  private readonly account = required('SEPAY_ACCOUNT');

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly ledger: LedgerService,
  ) {}

  async get(buyerId: string, checkoutId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { checkoutId, checkout: { buyerId } },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    const qr = new URL('https://qr.sepay.vn/img');
    qr.search = new URLSearchParams({
      acc: this.account,
      bank: this.bank,
      amount: String(payment.amount),
      des: payment.code,
    }).toString();
    return {
      id: payment.id,
      checkoutId: payment.checkoutId,
      code: payment.code,
      amount: payment.amount,
      status: payment.status,
      expiresAt: payment.expiresAt,
      paidAt: payment.paidAt,
      bank: this.bank,
      accountNumber: this.account,
      qrUrl: qr.toString(),
    };
  }

  // Records every incoming transfer once. A transfer pays its checkout only when the code,
  // the exact amount and the deadline all match and every order is still unpaid; anything
  // else is booked as money owed back to the sender.
  async receive(transfer: SepayTransfer, now = new Date()) {
    if (transfer.transferType !== 'in') return;
    await this.prisma.$transaction(async (tx) => {
      const [row] = await tx.bankTransfer.createManyAndReturn({
        data: {
          providerId: transfer.id,
          matched: false,
          amount: transfer.transferAmount,
          content: transfer.content,
          referenceCode: transfer.referenceCode,
          payload: transfer as unknown as Prisma.InputJsonValue,
        },
        skipDuplicates: true,
      });
      if (!row) return;

      const code = findPaymentCode(
        `${transfer.code ?? ''} ${transfer.content}`,
      );
      const payment = code
        ? await tx.payment.findUnique({ where: { code } })
        : null;
      const matched =
        payment?.status === PaymentStatus.pending &&
        payment.amount === transfer.transferAmount &&
        payment.expiresAt > now &&
        (await this.orders.payCheckout(tx, payment.checkoutId));

      if (matched) {
        const { count } = await tx.payment.updateMany({
          where: { id: payment.id, status: PaymentStatus.pending },
          data: { status: PaymentStatus.paid, paidAt: now },
        });
        if (count === 0) throw new ConflictException('Payment changed');
        await this.ledger.receivePayment(tx, payment);
      } else {
        await this.ledger.receiveUnmatched(tx, row);
      }
      await tx.bankTransfer.update({
        where: { id: row.id },
        data: { matched, paymentId: payment?.id },
      });
    });
  }
}
