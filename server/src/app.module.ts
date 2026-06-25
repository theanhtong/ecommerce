import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { BrandsModule } from './brands/brands.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AppController],
  providers: [AppService],
  imports: [BrandsModule, CategoriesModule],
})
export class AppModule {}
