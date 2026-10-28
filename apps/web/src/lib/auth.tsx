import { useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, refreshSession, setAccessToken } from './api';
import { AuthContext, type AuthState } from './auth-context';
import type { User } from './types';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [signedOut, setSignedOut] = useState(false);

  const reload = useCallback(async () => {
    setUser(await api<User>('/users/me'));
  }, []);

  useEffect(() => {
    void refreshSession()
      .then((ok) => (ok ? reload() : undefined))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, [reload]);

  const start = useCallback(
    async (path: string, body: unknown) => {
      const { accessToken } = await api<{ accessToken: string }>(path, {
        method: 'POST',
        body,
      });
      setAccessToken(accessToken);
      queryClient.clear();
      await reload();
      setSignedOut(false);
    },
    [queryClient, reload],
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      ready,
      signedOut,
      reload,
      login: (email, password) => start('/auth/login', { email, password }),
      register: (input) => start('/auth/register', input),
      logout: async () => {
        await api('/auth/logout', { method: 'POST' });
        setAccessToken(null);
        setSignedOut(true);
        setUser(null);
        queryClient.clear();
      },
    }),
    [user, ready, signedOut, reload, start, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
