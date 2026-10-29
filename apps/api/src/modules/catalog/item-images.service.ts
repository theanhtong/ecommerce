import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@ecommerce/db';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  IMAGE_TYPES,
  imageView,
  MAGIC_BYTES,
  MAX_IMAGE_BYTES,
  sniffImage,
} from '../storage/images.js';
import { StorageService, TMP_PREFIX } from '../storage/storage.service.js';
import { ItemsService } from './items.service.js';
import { coded } from '../../common/http-error.js';

// Assumption: up to 9 images per item, as sellers commonly report.
export const MAX_ITEM_IMAGES = 9;

@Injectable()
export class ItemImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly items: ItemsService,
    private readonly storage: StorageService,
  ) {}

  // Claims a browser upload: checks the bytes, then copies it under the item and drops the upload.
  async add(ownerId: string, itemId: string, upload: string) {
    await this.items.writableItem(ownerId, itemId);
    if (!upload.startsWith(`${TMP_PREFIX}${ownerId}/`)) {
      throw new BadRequestException('Unknown upload');
    }
    const found = await this.storage.inspect(upload, MAGIC_BYTES);
    if (!found) throw new BadRequestException('Upload not found');
    const type = sniffImage(found.start);
    if (!type || found.size > MAX_IMAGE_BYTES) {
      await this.storage.delete([upload]);
      throw new BadRequestException('Images must be JPG or PNG up to 2 MB');
    }

    const key = `items/${itemId}/${randomUUID()}.${IMAGE_TYPES[type].ext}`;
    await this.storage.copy(upload, key, type);
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockItem(tx, itemId);
        const position = await tx.itemImage.count({ where: { itemId } });
        if (position >= MAX_ITEM_IMAGES) {
          throw new ConflictException(
            coded(
              'item_images_max',
              `An item has at most ${MAX_ITEM_IMAGES} images`,
              { max: MAX_ITEM_IMAGES },
            ),
          );
        }
        await tx.itemImage.create({ data: { itemId, key, position } });
      });
    } catch (error) {
      await this.storage.delete([key]);
      throw error;
    }
    await this.storage.delete([upload]);
    return this.list(itemId);
  }

  async reorder(ownerId: string, itemId: string, ids: string[]) {
    await this.items.writableItem(ownerId, itemId);
    await this.prisma.$transaction(async (tx) => {
      await this.lockItem(tx, itemId);
      const images = await tx.itemImage.findMany({ where: { itemId } });
      const known = new Set(images.map((i) => i.id));
      if (
        ids.length !== images.length ||
        new Set(ids).size !== ids.length ||
        !ids.every((id) => known.has(id))
      ) {
        throw new BadRequestException('Send every image of the item once');
      }
      await this.place(tx, ids);
    });
    return this.list(itemId);
  }

  async remove(ownerId: string, itemId: string, imageId: string) {
    await this.items.writableItem(ownerId, itemId);
    const removed = await this.prisma.$transaction(async (tx) => {
      await this.lockItem(tx, itemId);
      const image = await tx.itemImage.findFirst({
        where: { id: imageId, itemId },
      });
      if (!image) throw new NotFoundException('Image not found');
      await tx.itemImage.delete({ where: { id: imageId } });
      const rest = await tx.itemImage.findMany({
        where: { itemId },
        orderBy: { position: 'asc' },
      });
      await this.place(
        tx,
        rest.map((i) => i.id),
      );
      return image;
    });
    await this.deleteUnreferenced([removed.key]);
    return this.list(itemId);
  }

  // Orders keep showing the cover they were placed with.
  async deleteUnreferenced(keys: string[]) {
    const kept = await this.prisma.orderItem.findMany({
      where: { imageKey: { in: keys } },
      select: { imageKey: true },
      distinct: ['imageKey'],
    });
    const referenced = new Set(kept.map((k) => k.imageKey));
    await this.storage.delete(keys.filter((k) => !referenced.has(k)));
  }

  private async list(itemId: string) {
    const images = await this.prisma.itemImage.findMany({
      where: { itemId },
      orderBy: { position: 'asc' },
    });
    return images.map(imageView);
  }

  private async lockItem(tx: Prisma.TransactionClient, itemId: string) {
    await tx.$queryRaw`SELECT 1 FROM items WHERE id = ${itemId}::uuid FOR UPDATE`;
  }

  private async place(tx: Prisma.TransactionClient, ids: string[]) {
    for (const [position, id] of ids.entries()) {
      await tx.itemImage.update({ where: { id }, data: { position } });
    }
  }
}
