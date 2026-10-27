import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, ImagePlus, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import { toast } from 'sonner';
import { ItemImage } from '@/components/common';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { api, ApiError } from '@/lib/api';
import type { ItemDetail } from '@/lib/types';

const MAX_IMAGES = 9;
const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png'];

type Image = ItemDetail['images'][number];

interface SignedUpload {
  key: string;
  url: string;
  fields: Record<string, string>;
}

// Signed form from the API, file straight to storage, then the API claims the upload.
async function uploadImage(itemId: string, file: File) {
  const signed = await api<SignedUpload>('/uploads/images', {
    method: 'POST',
    body: { contentType: file.type },
  });
  const form = new FormData();
  for (const [name, value] of Object.entries(signed.fields)) {
    form.append(name, value);
  }
  form.append('file', file);
  const res = await fetch(signed.url, { method: 'POST', body: form });
  if (!res.ok) throw new ApiError(res.status, 'Tải ảnh thất bại');
  return api<Image[]>(`/items/${itemId}/images`, {
    method: 'POST',
    body: { key: signed.key },
  });
}

export function ItemImagesEditor({ item }: { item: ItemDetail }) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const saved = (images: Image[]) => {
    queryClient.setQueryData<ItemDetail>(
      ['my-item', item.id],
      (old) => old && { ...old, images },
    );
    void queryClient.invalidateQueries({ queryKey: ['my-items'] });
  };
  const add = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) saved(await uploadImage(item.id, file));
    },
    onError: (error) => toast.error(error.message),
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) =>
      api<Image[]>(`/items/${item.id}/images`, {
        method: 'PUT',
        body: { ids },
      }),
    onSuccess: saved,
  });
  const remove = useMutation({
    mutationFn: (imageId: string) =>
      api<Image[]>(`/items/${item.id}/images/${imageId}`, {
        method: 'DELETE',
      }),
    onSuccess: saved,
  });
  const busy = add.isPending || reorder.isPending || remove.isPending;
  const ids = item.images.map((i) => i.id);
  const move = (from: number, to: number) => {
    const next = [...ids];
    next.splice(to, 0, ...next.splice(from, 1));
    reorder.mutate(next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Hình ảnh ({item.images.length}/{MAX_IMAGES})
        </CardTitle>
        <CardAction>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || item.images.length >= MAX_IMAGES}
            onClick={() => input.current?.click()}
          >
            <ImagePlus />
            Thêm ảnh
          </Button>
          <input
            ref={input}
            type="file"
            accept={TYPES.join(',')}
            multiple
            hidden
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              const bad = files.find(
                (f) => !TYPES.includes(f.type) || f.size > MAX_BYTES,
              );
              if (bad) {
                toast.error('Ảnh phải là JPG hoặc PNG, tối đa 2MB');
                return;
              }
              add.mutate(files.slice(0, MAX_IMAGES - item.images.length));
            }}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {item.images.length === 0 && <ItemImage className="size-24" />}
        {item.images.map((image, i) => (
          <div key={image.id} className="grid gap-1">
            <div className="relative">
              <ItemImage src={image.url} />
              {i === 0 && (
                <span className="absolute bottom-1 left-1 rounded bg-primary px-1.5 text-xs text-primary-foreground">
                  Ảnh bìa
                </span>
              )}
            </div>
            <div className="flex justify-center">
              <Button
                size="icon"
                variant="ghost"
                aria-label="Lên trước"
                disabled={busy || i === 0}
                onClick={() => move(i, i - 1)}
              >
                <ArrowLeft />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Xuống sau"
                disabled={busy || i === item.images.length - 1}
                onClick={() => move(i, i + 1)}
              >
                <ArrowRight />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Xóa ảnh"
                disabled={busy}
                onClick={() => remove.mutate(image.id)}
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// Product page gallery: the picked image large, every image as a thumbnail.
export function ItemGallery({
  images,
  picked,
  onPick,
}: {
  images: Image[];
  picked: number;
  onPick: (index: number) => void;
}) {
  return (
    <div className="grid content-start gap-2">
      <ItemImage src={images[picked]?.url} className="rounded-lg" />
      {images.length > 1 && (
        <div className="grid grid-cols-5 gap-2">
          {images.map((image, i) => (
            <button
              key={image.id}
              type="button"
              aria-label={`Ảnh ${i + 1}`}
              className={
                i === picked
                  ? 'rounded-md ring-2 ring-primary'
                  : 'rounded-md opacity-70 hover:opacity-100'
              }
              onMouseEnter={() => onPick(i)}
              onClick={() => onPick(i)}
            >
              <ItemImage src={image.url} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
