import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  type RawBodyRequest,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AccessTokenPayload } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { MemberOnly } from '../auth/decorators/member-only.decorator.js';
import { PaymentsService } from './payments.service.js';
import { parseTransfer, verifySignature } from './sepay.js';

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('checkouts/:id/payment')
  @MemberOnly()
  get(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.payments.get(user.sub, id);
  }

  // The provider retries until it gets {"success": true}.
  @Post('payments/sepay/webhook')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-sepay-signature') signature?: string,
    @Headers('x-sepay-timestamp') timestamp?: string,
  ) {
    if (
      !req.rawBody ||
      !verifySignature(
        this.payments.webhookSecret,
        req.rawBody,
        signature,
        timestamp,
      )
    ) {
      throw new UnauthorizedException('Invalid signature');
    }
    const transfer = parseTransfer(req.body);
    if (!transfer) throw new BadRequestException('Unexpected payload');
    await this.payments.receive(transfer);
    return { success: true };
  }
}
