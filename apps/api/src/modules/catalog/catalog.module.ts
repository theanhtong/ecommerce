import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminItemsController } from './admin-items.controller.js';
import { ItemImagesController } from './item-images.controller.js';
import { ItemImagesService } from './item-images.service.js';
import { ItemsImportController } from './import/items-import.controller.js';
import { ItemsImportService } from './import/items-import.service.js';
import { ItemsController } from './items.controller.js';
import { ItemsService } from './items.service.js';
import { ModelsController } from './models.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [
    ItemsImportController,
    ItemsController,
    ItemImagesController,
    ModelsController,
    AdminItemsController,
  ],
  providers: [ItemsService, ItemsImportService, ItemImagesService],
})
export class CatalogModule {}
