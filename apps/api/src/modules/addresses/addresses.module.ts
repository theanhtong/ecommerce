import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AddressesController } from './addresses.controller.js';
import { AddressesService } from './addresses.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AddressesController],
  providers: [AddressesService],
})
export class AddressesModule {}
