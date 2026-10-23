import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api, ApiError } from './api';
import type { Cart, MyShop, Page } from './types';

export function usePaged<T>(key: unknown[], path: string) {
  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => {
      const separator = path.includes('?') ? '&' : '?';
      return api<Page<T>>(
        pageParam ? `${path}${separator}cursor=${pageParam}` : path,
      );
    },
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  return {
    ...query,
    items: query.data?.pages.flatMap((p) => p.items) ?? [],
  };
}

export const useMyShop = () =>
  useQuery({
    queryKey: ['my-shop'],
    queryFn: async () => {
      try {
        return await api<MyShop>('/shops/me');
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  });

export const useCart = (enabled = true) =>
  useQuery({
    queryKey: ['cart'],
    queryFn: () => api<Cart>('/cart'),
    enabled,
  });
