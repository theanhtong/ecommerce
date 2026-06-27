import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Category } from '../generated/prisma/client.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { Paginated } from '../common/interfaces/paginated.interface.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { buildPaginated } from '../common/helpers/pagination.helper.js';
import { uuidv7 } from 'uuidv7';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto): Promise<Category> {
    await this.assertSlugUnique(dto.slug);

    if (dto.parentId) {
      await this.assertParentExists(dto.parentId);
    }

    return this.prisma.category.create({
      data: {
        id: uuidv7(),
        ...dto,
      },
      include: { parent: true },
    });
  }

  async findAll(query: PaginationDto): Promise<Paginated<Category>> {
    const where = {
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' as const } },
          { slug: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
        include: { parent: true },
      }),
      this.prisma.category.count({ where }),
    ]);

    return buildPaginated(data, total, query.page, query.limit);
  }

  async findOne(id: string): Promise<Category> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { parent: true, children: true },
    });
    if (!category) throw new NotFoundException(`Category #${id} not found`);
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    await this.findOne(id);

    if (dto.slug) await this.assertSlugUnique(dto.slug, id);

    if (dto.parentId) {
      await this.assertParentExists(dto.parentId);
      await this.assertNoCycle(id, dto.parentId);
    }

    return this.prisma.category.update({
      where: { id },
      data: dto,
      include: { parent: true, children: true },
    });
  }

  async remove(id: string): Promise<Category> {
    await this.findOne(id);

    return this.prisma.category.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private async assertSlugUnique(slug: string, excludeId?: string) {
    const existing = await this.prisma.category.findUnique({ where: { slug } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`Category slug "${slug}" already exists`);
    }
  }

  private async assertParentExists(parentId: string) {
    const parent = await this.prisma.category.findUnique({
      where: { id: parentId },
    });
    if (!parent) {
      throw new NotFoundException(`Parent category #${parentId} not found`);
    }
  }

  private async assertNoCycle(id: string, newParentId: string) {
    let currentId: string | null = newParentId;

    while (currentId !== null) {
      if (currentId === id) {
        throw new BadRequestException(
          'Category cannot be its own ancestor (circular reference)',
        );
      }
      const node = await this.prisma.category.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });
      currentId = node ? node.parentId : null;
    }
  }
}
