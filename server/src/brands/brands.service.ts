import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Brand } from '../generated/prisma/client.js';
import { CreateBrandDto } from './dto/create-brand.dto.js';
import { Paginated } from '../common/interfaces/paginated.interface.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateBrandDto } from './dto/update-brand.dto.js';
import { uuidv7 } from 'uuidv7';

@Injectable()
export class BrandsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBrandDto): Promise<Brand> {
    await this.assertNameUnique(dto.name);
    await this.assertSlugUnique(dto.slug);

    return this.prisma.brand.create({
      data: {
        id: uuidv7(),
        ...dto,
      },
    });
  }

  async findAll(query: PaginationDto): Promise<Paginated<Brand>> {
    const where = {
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' as const } },
          { slug: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.brand.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.brand.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string): Promise<Brand> {
    const brand = await this.prisma.brand.findUnique({ where: { id } });
    if (!brand) throw new NotFoundException(`Brand #${id} not found`);
    return brand;
  }

  async update(id: string, dto: UpdateBrandDto): Promise<Brand> {
    await this.findOne(id);

    if (dto.name) await this.assertNameUnique(dto.name, id);
    if (dto.slug) await this.assertSlugUnique(dto.slug, id);

    return this.prisma.brand.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string): Promise<Brand> {
    await this.findOne(id);

    return this.prisma.brand.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private async assertNameUnique(name: string, excludeId?: string) {
    const existing = await this.prisma.brand.findUnique({ where: { name } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`Brand name "${name}" already exists`);
    }
  }

  private async assertSlugUnique(slug: string, excludeId?: string) {
    const existing = await this.prisma.brand.findUnique({ where: { slug } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`Brand slug "${slug}" already exists`);
    }
  }
}
