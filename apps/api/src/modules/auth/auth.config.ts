export interface AuthConfig {
  accessSecret: string;
  accessTtlSeconds: number;
  refreshTtlDays: number;
  secureCookies: boolean;
}

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

function positiveInt(name: string): number {
  const value = Number(process.env[name]);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

// Must run at bootstrap: .env is loaded after ESM imports are evaluated.
export function loadAuthConfig(): AuthConfig {
  const accessSecret = process.env.JWT_ACCESS_SECRET ?? '';
  if (accessSecret.length < 32) {
    throw new Error('JWT_ACCESS_SECRET must be at least 32 characters');
  }
  return {
    accessSecret,
    accessTtlSeconds: positiveInt('ACCESS_TOKEN_TTL_SECONDS'),
    refreshTtlDays: positiveInt('REFRESH_TOKEN_TTL_DAYS'),
    secureCookies: process.env.NODE_ENV === 'production',
  };
}
