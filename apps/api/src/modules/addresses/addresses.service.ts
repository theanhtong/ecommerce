import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@ecommerce/db';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  assertWardExists,
  locationInclude,
  locationView,
} from '../regions/location.js';
import type { CreateAddressDto, UpdateAddressDto } from './dto/address.dto.js';

const query = {
  omit: { userId: true, wardCode: true },
  include: locationInclude,
} satisfies Pick<Prisma.AddressFindManyArgs, 'omit' | 'include'>;

const view = ({
  ward,
  ...address
}: Prisma.AddressGetPayload<typeof query>) => ({
  ...address,
  ...locationView({ ward }),
});

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const addresses = await this.prisma.address.findMany({
      where: { userId },
      ...query,
      orderBy: [{ isDefault: 'desc' }, { id: 'desc' }],
    });
    return addresses.map(view);
  }

  // The first address always becomes the default.
  async create(userId: string, { isDefault, ...fields }: CreateAddressDto) {
    await assertWardExists(this.prisma, fields.wardCode);
    return this.withDefaultGuard(() =>
      this.prisma.$transaction(async (tx) => {
        const makeDefault =
          isDefault || (await tx.address.count({ where: { userId } })) === 0;
        if (makeDefault) await this.clearDefault(tx, userId);
        const address = await tx.address.create({
          data: { ...fields, userId, isDefault: makeDefault },
          ...query,
        });
        return view(address);
      }),
    );
  }

  async update(userId: string, id: string, dto: UpdateAddressDto) {
    await this.owned(userId, id);
    await assertWardExists(this.prisma, dto.wardCode);
    const address = await this.prisma.address.update({
      where: { id },
      data: dto,
      ...query,
    });
    return view(address);
  }

  async setDefault(userId: string, id: string) {
    await this.owned(userId, id);
    return this.withDefaultGuard(() =>
      this.prisma.$transaction(async (tx) => {
        await this.clearDefault(tx, userId);
        const address = await tx.address.update({
          where: { id },
          data: { isDefault: true },
          ...query,
        });
        return view(address);
      }),
    );
  }

  async remove(userId: string, id: string) {
    const address = await this.owned(userId, id);
    if (address.isDefault) {
      const others = await this.prisma.address.count({
        where: { userId, id: { not: id } },
      });
      if (others) {
        throw new ConflictException('Set another default address first');
      }
    }
    await this.prisma.address.delete({ where: { id } });
  }

  private async owned(userId: string, id: string) {
    const address = await this.prisma.address.findFirst({
      where: { id, userId },
    });
    if (!address) throw new NotFoundException('Address not found');
    return address;
  }

  private clearDefault(tx: Prisma.TransactionClient, userId: string) {
    return tx.address.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });
  }

  private async withDefaultGuard<T>(run: () => Promise<T>) {
    try {
      return await run();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Address was changed concurrently, retry');
      }
      throw error;
    }
  }
}
