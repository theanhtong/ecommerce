import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError } from './api';
import type { Cart, MyShop, Page } from './types';

export const myShopQuery = {
  queryKey: ['my-shop'],
  queryFn: async () => {
    try {
      return await api<MyShop>('/shops/me');
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },
};

export const useMyShop = (enabled = true) =>
  useQuery({ ...myShopQuery, enabled });

export const useCart = (enabled = true) =>
  useQuery({
    queryKey: ['cart'],
    queryFn: () => api<Cart>('/cart'),
    enabled,
  });

// One page at a time over a cursor API; the cursors seen so far let it step back. A new key
// (another filter) starts again at page 1, and the old page stays shown while the next loads.
export function useCursorPage<P extends { nextCursor: string | null }>(
  key: unknown[],
  path: string,
) {
  const id = JSON.stringify([key, path]);
  const [state, setState] = useState({ id, cursors: [''] });
  const cursors = state.id === id ? state.cursors : [''];
  const cursor = cursors.at(-1)!;
  const separator = path.includes('?') ? '&' : '?';
  const query = useQuery({
    queryKey: [...key, cursor],
    queryFn: () =>
      api<P>(cursor ? `${path}${separator}cursor=${cursor}` : path),
    placeholderData: keepPreviousData,
  });
  const next = query.data?.nextCursor;
  return {
    ...query,
    page: cursors.length,
    next: next
      ? () => setState({ id, cursors: [...cursors, next] })
      : undefined,
    prev:
      cursors.length > 1
        ? () => setState({ id, cursors: cursors.slice(0, -1) })
        : undefined,
  };
}

export function usePaged<T>(key: unknown[], path: string) {
  const query = useCursorPage<Page<T>>(key, path);
  return { ...query, items: query.data?.items ?? [] };
}
