import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { StorageService } from './modules/storage/storage.service.js';
import { PrismaService } from './prisma/prisma.service.js';

@Controller()
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // The process is up; restart it if this stops answering.
  @Get('health')
  health() {
    return { status: 'ok' };
  }

  // Dependencies answer too; send traffic only while this passes.
  @Get('ready')
  async ready() {
    const checks = await Promise.all(
      Object.entries({
        database: () => this.prisma.$queryRaw`SELECT 1`,
        storage: () => this.storage.ping(),
      }).map(async ([name, check]) => {
        try {
          await check();
          return [name, 'ok'] as const;
        } catch {
          return [name, 'down'] as const;
        }
      }),
    );
    const body = { status: 'ok', checks: Object.fromEntries(checks) };
    if (checks.some(([, state]) => state !== 'ok')) {
      throw new ServiceUnavailableException({ ...body, status: 'down' });
    }
    return body;
  }
}
