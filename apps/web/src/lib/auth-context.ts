import { createContext, useContext } from 'react';
import type { User } from './types';

export interface AuthState {
  user: User | null;
  ready: boolean;
  // True after the user signs out here, so guards do not send them back to the page they left.
  signedOut: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    username: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside AuthProvider');
  return auth;
}
