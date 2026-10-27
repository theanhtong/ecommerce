export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

// One refresh at a time: concurrent 401s wait for the same rotation.
export function refreshSession() {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST' })
    .then(async (res) => {
      if (!res.ok) {
        accessToken = null;
        return false;
      }
      accessToken = ((await res.json()) as { accessToken: string }).accessToken;
      return true;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  form?: FormData;
  headers?: Record<string, string>;
}

async function send(path: string, options: RequestOptions) {
  return fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body !== undefined && {
        'Content-Type': 'application/json',
      }),
      ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      ...options.headers,
    },
    body:
      options.form ??
      (options.body === undefined ? undefined : JSON.stringify(options.body)),
  });
}

export async function api<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  let res = await send(path, options);
  if (res.status === 401 && accessToken && (await refreshSession())) {
    res = await send(path, options);
  }
  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const message = (data as { message?: string | string[] } | undefined)
      ?.message;
    throw new ApiError(
      res.status,
      Array.isArray(message) ? message.join(', ') : (message ?? res.statusText),
    );
  }
  return data as T;
}

export async function download(path: string) {
  const res = await send(path, {});
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  return res.blob();
}
