import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { MemberOnly } from '../auth/decorators/member-only.decorator.js';
import { AddressesService } from './addresses.service.js';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto.js';

@Controller('addresses')
@MemberOnly()
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.addresses.list(user.sub);
  }

  @Post()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateAddressDto,
  ) {
    return this.addresses.create(user.sub, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addresses.update(user.sub, id, dto);
  }

  @Put(':id/default')
  setDefault(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.addresses.setDefault(user.sub, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.addresses.remove(user.sub, id);
  }
}
