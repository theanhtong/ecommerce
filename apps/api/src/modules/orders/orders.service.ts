import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryReason,
  OrderStatus,
  Prisma,
  ShipmentStatus,
} from '@ecommerce/db';
import { cursorArgs, toPage } from '../../common/pagination.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ListOrdersQuery } from './dto/order.dto.js';
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

type CarrierStatus = Exclude<ShipmentStatus, 'awaiting_pickup'>;

const CARRIER_STEPS: Record<
  CarrierStatus,
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
  constructor(private readonly prisma: PrismaService) {}

  async listForBuyer(buyerId: string, query: ListOrdersQuery) {
    return this.list({ buyerId }, query);
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

  // The seller hands the order to the carrier; the order stays to_ship until pickup.
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

  // An unpaid order is the buyer's to abandon; a payable one either side may cancel until
  // shipment is arranged. Assumption: cancelling after that has to go through the carrier.
  async cancel(userId: string, id: string) {
    return this.transition(userId, id, {
      from: { unpaid: ['buyer'], to_ship: ['buyer', 'seller'] },
      to: OrderStatus.cancelled,
      stock: RELEASE,
      guard: async (tx) => {
        if (await tx.shipment.count({ where: { orderId: id } })) {
          throw new ConflictException('Shipment already arranged');
        }
      },
    });
  }

  async receive(userId: string, id: string) {
    return this.transition(userId, id, {
      from: { delivered: ['buyer'] },
      to: OrderStatus.completed,
    });
  }

  // Called by the carrier service. Repeating the current status is a no-op, so retried
  // callbacks are safe; skipping a step is refused.
  async carrierUpdate(shipmentId: string, status: CarrierStatus) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { order: { include: { items: true } } },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');
    if (shipment.status === status) return shipmentView(shipment);

    const step = CARRIER_STEPS[status];
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
        actorId: null,
        stock: step.stock,
      });
    });
    return shipmentView(
      await this.prisma.shipment.findUniqueOrThrow({
        where: { id: shipmentId },
      }),
    );
  }

  private async list(where: Prisma.OrderWhereInput, query: ListOrdersQuery) {
    const orders = await this.prisma.order.findMany({
      where: { ...where, status: query.status },
      include: orderInclude,
      ...cursorArgs(query),
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
      guard?: (tx: Prisma.TransactionClient) => Promise<void>;
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

    await this.prisma.$transaction(async (tx) => {
      await this.lockOrder(tx, id);
      await rule.guard?.(tx);
      await this.move(tx, order, order.status, rule.to, {
        actorId: userId,
        stock: rule.stock,
      });
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
        delta: -item.quantity,
        reason: stock.reason,
        refType: 'order',
        refId: order.id,
        actorId,
      })),
    });
  }
}
