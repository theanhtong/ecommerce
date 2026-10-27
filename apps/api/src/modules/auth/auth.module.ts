import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AUTH_CONFIG, loadAuthConfig, type AuthConfig } from './auth.config.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      extraProviders: [{ provide: AUTH_CONFIG, useFactory: loadAuthConfig }],
      inject: [AUTH_CONFIG],
      useFactory: (config: AuthConfig) => ({
        secret: config.accessSecret,
        signOptions: { expiresIn: config.accessTtlSeconds, algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    { provide: AUTH_CONFIG, useFactory: loadAuthConfig },
    AuthService,
    JwtAuthGuard,
  ],
  exports: [AuthService, JwtAuthGuard, JwtModule],
})
export class AuthModule {}
