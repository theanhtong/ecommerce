import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminItemsController } from './admin-items.controller.js';
import { ItemsController } from './items.controller.js';
import { ItemsService } from './items.service.js';
import { ModelsController } from './models.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [
    ItemsController,
    ModelsController,
    AdminItemsController,
  ],
  providers: [ItemsService],
})
export class CatalogModule {}
