import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CancelReason,
  InventoryReason,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  ReturnStatus,
  ShipmentStatus,
} from '@ecommerce/db';
import { cursorArgs, toPage } from '../../common/pagination.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { emit } from '../notifications/outbox.service.js';
import { releaseFlashSales } from '../promotions/flash-sales.js';
import { VouchersService } from '../promotions/vouchers.service.js';
import type { AdminListOrdersQuery, ListOrdersQuery } from './dto/order.dto.js';
import { orderInclude, orderView } from './order-view.js';

type Party = 'buyer' | 'seller';
type StockEffect = {
  reason: InventoryReason;
  onHand: number;
  reserved: number;
};

// Stock leaves the warehouse at pickup, so on-hand and the reservation drop together.
const SALE: StockEffect = {
  reason: InventoryReason.sale,
  onHand: -1,
  reserved: -1,
};
const RELEASE: StockEffect = {
  reason: InventoryReason.release,
  onHand: 0,
  reserved: -1,
};
// Assumption: returned goods are sellable again once the return is accepted.
const RETURN: StockEffect = {
  reason: InventoryReason.return,
  onHand: 1,
  reserved: 0,
};
const OPEN_RETURN = { in: [ReturnStatus.requested, ReturnStatus.disputed] };

const DAY_MS = 24 * 60 * 60 * 1000;
// Assumption: a seller has 3 days from when an order becomes payable to arrange shipment.
const SHIP_DEADLINE_MS = 3 * DAY_MS;
// A delivered order completes on its own 3 days later if the buyer does not confirm it first.
const AUTO_COMPLETE_AFTER_MS = 3 * DAY_MS;
const SWEEP_BATCH = 100;

type SweptOrder = Prisma.OrderGetPayload<{
  include: { items: true; checkout: { select: { paymentMethod: true } } };
}>;

type ShipmentStep = Exclude<ShipmentStatus, 'awaiting_pickup'>;

const SHIPMENT_STEPS: Record<
  ShipmentStep,
  {
    shipmentFrom: ShipmentStatus;
    orderFrom: OrderStatus;
    orderTo: OrderStatus;
    stamp: 'pickedUpAt' | 'deliveredAt';
    stock?: StockEffect;
  }
> = {
  picked_up: {
    shipmentFrom: ShipmentStatus.awaiting_pickup,
    orderFrom: OrderStatus.to_ship,
    orderTo: OrderStatus.shipping,
    stamp: 'pickedUpAt',
    stock: SALE,
  },
  delivered: {
    shipmentFrom: ShipmentStatus.picked_up,
    orderFrom: OrderStatus.shipping,
    orderTo: OrderStatus.delivered,
    stamp: 'deliveredAt',
  },
};

const shipmentView = (s: {
  id: string;
  orderId: string;
  status: ShipmentStatus;
  pickedUpAt: Date | null;
  deliveredAt: Date | null;
}) => ({
  id: s.id,
  orderId: s.orderId,
  status: s.status,
  pickedUpAt: s.pickedUpAt,
  deliveredAt: s.deliveredAt,
});

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly vouchers: VouchersService,
  ) {}

  async listForBuyer(buyerId: string, query: ListOrdersQuery) {
    return this.list({ buyerId }, query);
  }

  async listForAdmin({ buyerId, shopId, ...query }: AdminListOrdersQuery) {
    const orders = await this.prisma.order.findMany({
      where: { buyerId, shopId, status: query.status },
      include: {
        ...orderInclude,
        buyer: { select: { id: true, email: true, username: true } },
      },
      ...cursorArgs(query, 'desc'),
    });
    const page = toPage(orders, query.limit);
    return {
      ...page,
      items: page.items.map(({ buyer, ...o }) => ({ ...orderView(o), buyer })),
    };
  }

  async listForShop(ownerId: string, query: ListOrdersQuery) {
    const shop = await this.prisma.shop.findUnique({ where: { ownerId } });
    if (!shop) throw new NotFoundException('You do not have a shop');
    return this.list({ shopId: shop.id }, query);
  }

  async get(userId: string, id: string) {
    const { order } = await this.involved(userId, id);
    return orderView(order);
  }

  // The order stays to_ship until the carrier picks it up.
  async ship(userId: string, id: string) {
    const { party } = await this.involved(userId, id);
    if (party !== 'seller') {
      throw new ForbiddenException('Only the seller can do this');
    }
    await this.prisma.$transaction(async (tx) => {
      const status = await this.lockOrder(tx, id);
      if (status !== OrderStatus.to_ship) {
        throw new ConflictException(`Order is ${status}`);
      }
      const { count } = await tx.shipment.createMany({
        data: { orderId: id },
        skipDuplicates: true,
      });
      if (count === 0) {
        throw new ConflictException('Shipment already arranged');
      }
    });
    return this.get(userId, id);
  }

  // Assumption: once shipment is arranged, cancelling has to go through the carrier.
  async cancel(
    userId: string,
    id: string,
    { reason, note }: { reason?: CancelReason; note?: string },
  ) {
    return this.transition(userId, id, {
      from: { unpaid: ['buyer'], to_ship: ['buyer', 'seller'] },
      to: OrderStatus.cancelled,
      stock: RELEASE,
      check: (party) => {
        if (party === 'buyer' && !reason) {
          throw new BadRequestException('reason is required');
        }
        if (reason === CancelReason.other && !note) {
          throw new BadRequestException('note is required for other');
        }
      },
      guard: async (tx) => {
        if (await tx.shipment.count({ where: { orderId: id } })) {
          throw new ConflictException('Shipment already arranged');
        }
      },
      after: async (tx, order) => {
        await this.cancelled(tx, order);
        if (reason) {
          await tx.order.update({
            where: { id },
            data: {
              cancelReason: reason,
              cancelNote: reason === CancelReason.other ? note : null,
            },
          });
        }
      },
    });
  }

  async receive(userId: string, id: string) {
    return this.transition(userId, id, {
      from: { delivered: ['buyer'] },
      to: OrderStatus.completed,
      guard: async (tx) => {
        if (
          await tx.returnRequest.count({
            where: { orderId: id, status: OPEN_RETURN },
          })
        ) {
          throw new ConflictException('A return is open for this order');
        }
      },
      after: (tx, order) => this.settle(tx, order),
    });
  }

  // Called inside the transaction that accepts a return. A delivered order is settled first,
  // so the reversal always undoes a real settlement.
  async returnOrder(
    tx: Prisma.TransactionClient,
    id: string,
    actorId: string | null,
  ) {
    const status = await this.lockOrder(tx, id);
    if (status !== OrderStatus.delivered && status !== OrderStatus.completed) {
      throw new ConflictException(`Order is ${status}`);
    }
    const order = await tx.order.findUniqueOrThrow({
      where: { id },
      include: { items: true, checkout: { select: { paymentMethod: true } } },
    });
    if (status === OrderStatus.delivered) await this.settle(tx, order);
    await this.move(tx, order, status, OrderStatus.returned, {
      actorId,
      stock: RETURN,
    });
    await this.ledger.reverseSettlement(tx, order);
    await this.vouchers.releaseIfCancelled(tx, order.checkoutId);
  }

  // All orders of the checkout or none; false when any is no longer unpaid.
  async payCheckout(tx: Prisma.TransactionClient, checkoutId: string) {
    const orders = await tx.$queryRaw<{ id: string; status: OrderStatus }[]>`
      SELECT id, status FROM orders WHERE checkout_id = ${checkoutId}::uuid
      ORDER BY id FOR UPDATE`;
    if (orders.some((o) => o.status !== OrderStatus.unpaid)) return false;
    for (const { id } of orders) {
      await this.move(
        tx,
        { id, items: [] },
        OrderStatus.unpaid,
        OrderStatus.to_ship,
        {
          actorId: null,
        },
      );
    }
    return true;
  }

  // Repeats are no-ops so a double submit is safe; skipped steps are refused.
  private async advanceShipment(
    shipmentId: string,
    status: ShipmentStep,
    actorId: string | null = null,
  ) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { order: { include: { items: true } } },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');
    if (shipment.status === status) return shipmentView(shipment);

    const step = SHIPMENT_STEPS[status];
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.shipment.updateMany({
        where: { id: shipmentId, status: step.shipmentFrom },
        data: { status, [step.stamp]: new Date() },
      });
      if (count === 0) {
        const current = await tx.shipment.findUniqueOrThrow({
          where: { id: shipmentId },
        });
        if (current.status === status) return;
        throw new ConflictException(`Shipment is ${current.status}`);
      }
      await this.move(tx, shipment.order, step.orderFrom, step.orderTo, {
        actorId,
        stock: step.stock,
      });
    });
    return shipmentView(
      await this.prisma.shipment.findUniqueOrThrow({
        where: { id: shipmentId },
      }),
    );
  }

  cancelUnshipped(now = new Date()) {
    const cutoff = new Date(now.getTime() - SHIP_DEADLINE_MS);
    return this.sweep(
      {
        status: OrderStatus.to_ship,
        shipment: { is: null },
        history: {
          some: { toStatus: OrderStatus.to_ship, createdAt: { lt: cutoff } },
        },
      },
      OrderStatus.cancelled,
      { stock: RELEASE, after: (tx, order) => this.cancelled(tx, order) },
    );
  }

  expireUnpaid(now = new Date()) {
    return this.sweep(
      {
        status: OrderStatus.unpaid,
        checkout: { payment: { expiresAt: { lt: now } } },
      },
      OrderStatus.cancelled,
      {
        stock: RELEASE,
        after: async (tx, order) => {
          await tx.payment.updateMany({
            where: {
              checkoutId: order.checkoutId,
              status: PaymentStatus.pending,
            },
            data: { status: PaymentStatus.expired },
          });
          await this.cancelled(tx, order);
        },
      },
    );
  }

  completeDelivered(now = new Date()) {
    const cutoff = new Date(now.getTime() - AUTO_COMPLETE_AFTER_MS);
    return this.sweep(
      {
        status: OrderStatus.delivered,
        shipment: { is: { deliveredAt: { lt: cutoff } } },
        NOT: { returnRequest: { is: { status: OPEN_RETURN } } },
      },
      OrderStatus.completed,
      { after: (tx, order) => this.settle(tx, order) },
    );
  }

  private settle(
    tx: Prisma.TransactionClient,
    order: Omit<SweptOrder, 'items'>,
  ) {
    return this.ledger.settleOrder(tx, {
      ...order,
      paymentMethod: order.checkout.paymentMethod,
    });
  }

  // Money already paid is owed back, and the platform voucher returns with the last order.
  private async cancelled(
    tx: Prisma.TransactionClient,
    order: Omit<SweptOrder, 'items'>,
  ) {
    if (
      order.status !== OrderStatus.unpaid &&
      order.checkout.paymentMethod === PaymentMethod.online &&
      order.total > 0
    ) {
      await this.ledger.refundOrder(tx, order);
    }
    await this.vouchers.releaseIfCancelled(tx, order.checkoutId);
    await releaseFlashSales(tx, order.id);
  }

  // Re-checks `where` under the row lock, so orders changed meanwhile are skipped.
  private async sweep(
    where: Prisma.OrderWhereInput,
    to: OrderStatus,
    rule: {
      stock?: StockEffect;
      after?: (
        tx: Prisma.TransactionClient,
        order: SweptOrder,
      ) => Promise<void>;
    },
  ) {
    let moved = 0;
    for (;;) {
      const orders = await this.prisma.order.findMany({
        where,
        include: { items: true, checkout: { select: { paymentMethod: true } } },
        orderBy: { id: 'asc' },
        take: SWEEP_BATCH,
      });
      for (const order of orders) {
        await this.prisma.$transaction(async (tx) => {
          await this.lockOrder(tx, order.id);
          if (!(await tx.order.count({ where: { ...where, id: order.id } }))) {
            return;
          }
          await this.move(tx, order, order.status, to, {
            actorId: null,
            stock: rule.stock,
          });
          await rule.after?.(tx, order);
          moved++;
        });
      }
      if (orders.length < SWEEP_BATCH) return moved;
    }
  }

  // shortcut: the seller reports pickup and delivery until a carrier integration can.
  async updateShipment(userId: string, id: string, status: ShipmentStep) {
    const { party, order } = await this.involved(userId, id);
    if (party !== 'seller') {
      throw new ForbiddenException('Only the seller can do this');
    }
    if (!order.shipment) throw new ConflictException('Shipment not arranged');
    await this.advanceShipment(order.shipment.id, status, userId);
    return this.get(userId, id);
  }

  private async list(where: Prisma.OrderWhereInput, query: ListOrdersQuery) {
    const orders = await this.prisma.order.findMany({
      where: { ...where, status: query.status },
      include: orderInclude,
      ...cursorArgs(query, 'desc'),
    });
    const page = toPage(orders, query.limit);
    return { ...page, items: page.items.map(orderView) };
  }

  private async involved(userId: string, id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { ...orderInclude, shop: true },
    });
    const party: Party | null =
      order?.buyerId === userId
        ? 'buyer'
        : order?.shop.ownerId === userId
          ? 'seller'
          : null;
    if (!order || !party) throw new NotFoundException('Order not found');
    return {
      party,
      order: { ...order, shop: { id: order.shop.id, name: order.shop.name } },
    };
  }

  // Serializes everything that changes one order, so checks made after it see the latest state.
  private async lockOrder(tx: Prisma.TransactionClient, id: string) {
    const [row] = await tx.$queryRaw<{ status: OrderStatus }[]>`
      SELECT status FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
    return row.status;
  }

  private async transition(
    userId: string,
    id: string,
    rule: {
      // Who may make this move from each allowed status.
      from: Partial<Record<OrderStatus, Party[]>>;
      to: OrderStatus;
      stock?: StockEffect;
      check?: (party: Party) => void;
      guard?: (tx: Prisma.TransactionClient) => Promise<void>;
      after?: (
        tx: Prisma.TransactionClient,
        order: Awaited<ReturnType<OrdersService['involved']>>['order'],
      ) => Promise<void>;
    },
  ) {
    const { party, order } = await this.involved(userId, id);
    const allowed = rule.from[order.status];
    if (!allowed) throw new ConflictException(`Order is ${order.status}`);
    if (!allowed.includes(party)) {
      throw new ForbiddenException(
        `Only the ${allowed.join(' or ')} can do this`,
      );
    }
    rule.check?.(party);

    await this.prisma.$transaction(async (tx) => {
      await this.lockOrder(tx, id);
      await rule.guard?.(tx);
      await this.move(tx, order, order.status, rule.to, {
        actorId: userId,
        stock: rule.stock,
      });
      await rule.after?.(tx, order);
    });
    return this.get(userId, id);
  }

  private async move(
    tx: Prisma.TransactionClient,
    order: { id: string; items: { modelId: string; quantity: number }[] },
    from: OrderStatus,
    to: OrderStatus,
    { actorId, stock }: { actorId: string | null; stock?: StockEffect },
  ) {
    const { count } = await tx.order.updateMany({
      where: { id: order.id, status: from },
      data: { status: to },
    });
    if (count === 0) throw new ConflictException('Order changed, reload it');
    await tx.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: from, toStatus: to, actorId },
    });
    await emit(tx, {
      type: 'order.status_changed',
      payload: { orderId: order.id, from, to, actorId },
    });
    if (!stock) return;

    for (const item of [...order.items].sort((a, b) =>
      a.modelId.localeCompare(b.modelId),
    )) {
      await tx.$executeRaw`
        UPDATE inventory
        SET on_hand = on_hand + ${stock.onHand * item.quantity},
            reserved = reserved + ${stock.reserved * item.quantity},
            updated_at = now()
        WHERE model_id = ${item.modelId}::uuid`;
    }
    await tx.inventoryMovement.createMany({
      data: order.items.map((item) => ({
        modelId: item.modelId,
        delta: (stock.onHand || stock.reserved) * item.quantity,
        reason: stock.reason,
        refType: 'order',
        refId: order.id,
        actorId,
      })),
    });
  }
}
