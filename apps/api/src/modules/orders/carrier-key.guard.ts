import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

const digest = (value: string) => createHash('sha256').update(value).digest();

// Authenticates the carrier service by the shared secret in X-Carrier-Key.
@Injectable()
export class CarrierKeyGuard implements CanActivate {
  private readonly expected: Buffer;

  constructor() {
    const key = process.env.CARRIER_API_KEY ?? '';
    if (key.length < 32) {
      throw new Error('CARRIER_API_KEY must be at least 32 characters');
    }
    this.expected = digest(key);
  }

  canActivate(context: ExecutionContext): boolean {
    const presented = context
      .switchToHttp()
      .getRequest<Request>()
      .header('x-carrier-key');
    // Comparing digests keeps the check constant-time regardless of length.
    if (!presented || !timingSafeEqual(digest(presented), this.expected)) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
