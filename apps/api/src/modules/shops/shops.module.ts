import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminShopsController } from './admin-shops.controller.js';
import { ShopsController } from './shops.controller.js';
import { ShopsService } from './shops.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ShopsController, AdminShopsController],
  providers: [ShopsService],
})
export class ShopsModule {}
