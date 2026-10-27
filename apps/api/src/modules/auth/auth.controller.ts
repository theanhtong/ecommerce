import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AUTH_CONFIG, type AuthConfig } from './auth.config.js';
import {
  AuthService,
  type ClientMeta,
  type IssuedTokens,
} from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

export const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_PATH = '/auth';
const STRICT = { default: { limit: 5, ttl: 60_000 } };

const clientMeta = (req: Request): ClientMeta => ({
  ip: req.ip,
  userAgent: req.headers['user-agent'],
});

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  @Post('register')
  @Throttle(STRICT)
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, await this.auth.register(dto, clientMeta(req)));
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(STRICT)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, await this.auth.login(dto, clientMeta(req)));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) throw new UnauthorizedException();
    try {
      return this.respond(res, await this.auth.refresh(token, clientMeta(req)));
    } catch (error) {
      this.clearCookie(res);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE] as string | undefined);
    this.clearCookie(res);
  }

  private respond(res: Response, tokens: IssuedTokens) {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...this.cookieOptions(),
      expires: tokens.refreshExpiresAt,
    });
    return {
      accessToken: tokens.accessToken,
      expiresIn: this.config.accessTtlSeconds,
    };
  }

  private clearCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.secureCookies,
      sameSite: 'strict' as const,
      path: REFRESH_COOKIE_PATH,
    };
  }
}
