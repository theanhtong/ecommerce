import { ShipmentStatus } from '../../generated/prisma/enums.js';

export const GHN_STATUS_MAP: Record<string, ShipmentStatus> = {
  ready_to_pick: ShipmentStatus.PENDING,
  picking: ShipmentStatus.PENDING,
  picked: ShipmentStatus.PICKED_UP,
  storing: ShipmentStatus.IN_TRANSIT,
  transporting: ShipmentStatus.IN_TRANSIT,
  sorting: ShipmentStatus.IN_TRANSIT,
  delivering: ShipmentStatus.OUT_FOR_DELIVERY,
  delivered: ShipmentStatus.DELIVERED,
  delivery_fail: ShipmentStatus.FAILED,
  return: ShipmentStatus.RETURNED,
  returned: ShipmentStatus.RETURNED,
};
