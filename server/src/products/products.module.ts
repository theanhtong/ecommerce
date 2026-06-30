import { InventoryModule } from '../inventories/inventory.module.js';
import { Module } from '@nestjs/common';
import { ProductsAdminController } from './products-admin.controller.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

@Module({
  imports: [InventoryModule],
  controllers: [ProductsController, ProductsAdminController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
