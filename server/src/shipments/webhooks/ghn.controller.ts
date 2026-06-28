import {
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ShipmentsService } from '../shipments.service.js';
import { GHN_STATUS_MAP } from '../helpers/ghn-status.map.js';

@Controller('webhooks')
export class GhnWebhookController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Post('ghn')
  async handleGhnWebhook(
    @Headers('token') token: string,
    @Body() body: Record<string, unknown>,
  ) {
    if (token !== process.env.GHN_TOKEN) {
      throw new UnauthorizedException('Invalid GHN token');
    }

    const ghnStatus = body['Status'] as string;
    const orderCode = body['OrderCode'] as string;
    const description = body['Description'] as string | undefined;

    const mappedStatus = GHN_STATUS_MAP[ghnStatus];
    if (!mappedStatus) return { message: 'Status ignored' };

    const shipment =
      await this.shipmentsService.findByTrackingNumber(orderCode);
    if (!shipment) return { message: 'Shipment not found' };

    await this.shipmentsService.addTracking(shipment.id, {
      status: mappedStatus,
      description: description ?? ghnStatus,
    });

    return { message: 'Webhook processed' };
  }
}
