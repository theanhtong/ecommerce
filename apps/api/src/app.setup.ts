import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { requestLog } from './common/request-log.js';

export function configureApp(app: INestApplication) {
  // Behind a reverse proxy the client address is in X-Forwarded-For; trust only as many hops as really exist,
  // otherwise every client shares the proxy's address and its rate limit.
  const hops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (hops) app.getHttpAdapter().getInstance().set('trust proxy', hops);
  app.use(requestLog);
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
}
