import { CreateBrandDto } from './create-brand.dto.js';
import { PartialType } from '@nestjs/mapped-types';

export class UpdateBrandDto extends PartialType(CreateBrandDto) {}
