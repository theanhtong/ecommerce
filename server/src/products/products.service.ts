import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Product, ProductStatus } from '../generated/prisma/client.js';

import { CreateImageDto } from '../images/dto/create-image.dto.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { CreateVariantDto } from '../variants/dto/create-variant.dto.js';
import { InventoryService } from '../inventories/inventories.service.js';
import { Paginated } from '../common/interfaces/paginated.interface.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateInventoryDto } from '../inventories/dto/update-inventory.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { UpdateVariantDto } from '../variants/dto/update-variant.dto.js';
import { buildPaginated } from '../common/helpers/pagination.helper.js';
import { uuidv7 } from 'uuidv7';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  async create(dto: CreateProductDto): Promise<Product> {
    await this.assertSlugUnique(dto.slug);

    return this.prisma.product.create({
      data: { id: uuidv7(), ...dto },
      include: { category: true, brand: true },
    });
  }

  async findAll(query: PaginationDto): Promise<Paginated<Product>> {
    const where = {
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' as const } },
          { slug: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: { category: true, brand: true, images: true },
      }),
      this.prisma.product.count({ where }),
    ]);

    return buildPaginated(data, total, query.page, query.limit);
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        brand: true,
        images: { orderBy: { order: 'asc' } },
        variants: {
          include: {
            images: { orderBy: { order: 'asc' } },
            inventory: true,
          },
        },
      },
    });
    if (!product) throw new NotFoundException(`Product #${id} not found`);
    return product;
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    await this.findOne(id);
    if (dto.slug) await this.assertSlugUnique(dto.slug, id);

    return this.prisma.product.update({
      where: { id },
      data: dto,
      include: { category: true, brand: true },
    });
  }

  async remove(id: string): Promise<Product> {
    await this.findOne(id);

    return this.prisma.product.update({
      where: { id },
      data: { status: ProductStatus.ARCHIVED },
    });
  }

  async createVariant(productId: string, dto: CreateVariantDto) {
    await this.findOne(productId);
    await this.assertSkuUnique(dto.sku);

    return this.prisma.productVariant.create({
      data: {
        id: uuidv7(),
        productId,
        ...dto,
        inventory: {
          create: { id: uuidv7(), quantity: 0, reservedQuantity: 0 },
        },
      },
      include: { images: true, inventory: true },
    });
  }

  async updateVariant(
    productId: string,
    variantId: string,
    dto: UpdateVariantDto,
  ) {
    await this.findVariant(productId, variantId);
    if (dto.sku) await this.assertSkuUnique(dto.sku, variantId);

    return this.prisma.productVariant.update({
      where: { id: variantId },
      data: dto,
      include: { images: true, inventory: true },
    });
  }

  async removeVariant(productId: string, variantId: string) {
    await this.findVariant(productId, variantId);

    return this.prisma.productVariant.delete({ where: { id: variantId } });
  }

  async createImage(productId: string, variantId: string, dto: CreateImageDto) {
    await this.findVariant(productId, variantId);

    return this.prisma.productImage.create({
      data: { id: uuidv7(), productId, variantId, ...dto },
    });
  }

  async removeImage(productId: string, variantId: string, imageId: string) {
    await this.findVariant(productId, variantId);

    const image = await this.prisma.productImage.findUnique({
      where: { id: imageId },
    });
    if (!image) throw new NotFoundException(`Image #${imageId} not found`);

    return this.prisma.productImage.delete({ where: { id: imageId } });
  }

  async updateInventory(
    productId: string,
    variantId: string,
    dto: UpdateInventoryDto,
  ) {
    await this.findVariant(productId, variantId);
    return this.inventoryService.update(variantId, dto);
  }

  private async assertSlugUnique(slug: string, excludeId?: string) {
    const existing = await this.prisma.product.findUnique({ where: { slug } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`Product slug "${slug}" already exists`);
    }
  }

  private async assertSkuUnique(sku: string, excludeId?: string) {
    const existing = await this.prisma.productVariant.findUnique({
      where: { sku },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`SKU "${sku}" already exists`);
    }
  }

  private async findVariant(productId: string, variantId: string) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId },
    });
    if (!variant) {
      throw new NotFoundException(
        `Variant #${variantId} not found in product #${productId}`,
      );
    }
    return variant;
  }
}
