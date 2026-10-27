import { Module } from '@nestjs/common';
import { RegionsController } from './regions.controller.js';

@Module({ controllers: [RegionsController] })
export class RegionsModule {}
