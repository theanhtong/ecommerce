import { applyDecorators, BadRequestException } from '@nestjs/common';
import type { Prisma, Province, Ward } from '@ecommerce/db';
import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';
import { trim } from '../../common/transforms.js';
import type { PrismaService } from '../../prisma/prisma.service.js';

export const Text = (max: number) =>
  applyDecorators(Transform(trim), IsString(), Length(1, max));

// Accepts 0912 345 678, +84912345678 or 84912345678 and stores +84912345678.
export const VietnamesePhone = () =>
  applyDecorators(
    Transform(({ value }) => {
      if (typeof value !== 'string') return value;
      const match = /^(?:\+?84|0)([35789]\d{8})$/.exec(
        value.replace(/[\s.-]/g, ''),
      );
      return match ? `+84${match[1]}` : value;
    }),
    IsString(),
    Matches(/^\+84[35789]\d{8}$/, {
      message: 'phone must be a Vietnamese mobile number',
    }),
  );

export const WardCode = () =>
  applyDecorators(
    IsString(),
    Matches(/^\d{5}$/, { message: 'wardCode must be a 5-digit ward code' }),
  );

export const locationInclude = {
  ward: { include: { province: true } },
} satisfies Prisma.AddressInclude & Prisma.ShopInclude;

export const locationView = ({
  ward,
}: {
  ward: Ward & { province: Province };
}) => ({
  ward: { code: ward.code, name: ward.fullName },
  province: { code: ward.province.code, name: ward.province.fullName },
});

export async function assertWardExists(
  prisma: PrismaService,
  code: string | undefined,
) {
  if (code === undefined) return;
  const exists = await prisma.ward.count({ where: { code } });
  if (!exists) throw new BadRequestException('Unknown wardCode');
}
