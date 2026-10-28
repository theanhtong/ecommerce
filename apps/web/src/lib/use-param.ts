import { useSearchParams } from 'react-router';

// The view lives in the URL, so a reload, a shared link or Back shows the same thing.
export function useParam<T extends string>(
  name: string,
  fallback: T,
  allowed?: readonly T[],
) {
  const [params, setParams] = useSearchParams();
  const raw = params.get(name) as T | null;
  const value = raw && (!allowed || allowed.includes(raw)) ? raw : fallback;
  // Any other filter change sends the list back to its first page.
  const set = (next: T) =>
    setParams((current) => {
      const p = new URLSearchParams(current);
      if (next === fallback) p.delete(name);
      else p.set(name, next);
      if (name !== 'page') p.delete('page');
      return p;
    });
  return [value, set] as const;
}
