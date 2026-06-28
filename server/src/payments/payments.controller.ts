import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { PaymentsService } from './payments.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { Role } from '../generated/prisma/enums.js';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('orders/:orderId')
  createPayment(
    @CurrentUser() user: { id: string },
    @Param('orderId', new ParseUUIDPipe({ version: undefined }))
    orderId: string,
    @Body() dto: CreatePaymentDto,
    @Req() req: Request,
  ) {
    return this.paymentsService.createPayment(
      user.id,
      orderId,
      dto,
      req.ip ?? '127.0.0.1',
    );
  }

  // VNPay IPN - server to server
  @Post('vnpay/ipn')
  vnpayIpn(@Query() query: Record<string, string>) {
    return this.paymentsService.handleVnpayIpn(query);
  }

  // VNPay return - redirect sau khi thanh toán
  @Get('vnpay/return')
  vnpayReturn(@Query() query: Record<string, string>) {
    return this.paymentsService.handleVnpayReturn(query);
  }

  @UseGuards(JwtAuthGuard)
  @Get('orders/:orderId')
  getPayment(
    @CurrentUser() user: { id: string },
    @Param('orderId', new ParseUUIDPipe({ version: undefined }))
    orderId: string,
  ) {
    return this.paymentsService.getPayment(user.id, orderId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin')
  findAll(@Query() query: PaginationDto) {
    return this.paymentsService.findAll(query);
  }
}
