import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';

export const IsUsername = () =>
  applyDecorators(
    Transform(({ value }) =>
      typeof value === 'string' ? value.trim().toLowerCase() : value,
    ),
    IsString(),
    Matches(/^[a-z0-9._]{5,30}$/, {
      message:
        'username must be 5-30 characters of a-z, 0-9, dot or underscore',
    }),
  );
