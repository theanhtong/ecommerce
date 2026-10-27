import { mediaUrl } from './storage.service.js';

// Assumption: JPG or PNG up to 2 MB, as sellers commonly report for product photos.
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export const IMAGE_TYPES = {
  'image/jpeg': { ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
  'image/png': {
    ext: 'png',
    magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
} as const;
export type ImageType = keyof typeof IMAGE_TYPES;
export const MAGIC_BYTES = 8;

// The type the bytes say, not the one the client claimed.
export function sniffImage(start: Buffer): ImageType | null {
  for (const [type, { magic }] of Object.entries(IMAGE_TYPES)) {
    if (magic.every((byte, i) => start[i] === byte)) return type as ImageType;
  }
  return null;
}

export const imageView = (image: { id: string; key: string }) => ({
  id: image.id,
  url: mediaUrl(image.key),
});
