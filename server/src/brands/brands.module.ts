import { BrandsController } from './brands.controller.js';
import { BrandsService } from './brands.service.js';
import { Module } from '@nestjs/common';

@Module({
  controllers: [BrandsController],
  providers: [BrandsService],
})
export class BrandsModule {}
