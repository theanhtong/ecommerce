import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StorageService } from './storage.service.js';
import { UploadsController } from './uploads.controller.js';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [UploadsController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
