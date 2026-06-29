import { Module } from '@nestjs/common';
import { ReviewsAdminController } from './reviews-admin.controller.js';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';

@Module({
  controllers: [ReviewsController, ReviewsAdminController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
