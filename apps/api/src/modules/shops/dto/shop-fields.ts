import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';
import { trim } from '../../../common/transforms.js';

export const ShopName = () =>
  applyDecorators(
    Transform(trim),
    IsString(),
    Length(5, 30),
    Matches(/^[\p{L}\p{M}\p{N} ]+$/u, {
      message: 'name may only contain letters, digits and spaces',
    }),
  );
