import { BrandsAdminController } from './brands-admin.controller.js';
import { BrandsController } from './brands.controller.js';
import { BrandsService } from './brands.service.js';
import { Module } from '@nestjs/common';

@Module({
  controllers: [BrandsController, BrandsAdminController],
  providers: [BrandsService],
})
export class BrandsModule {}
