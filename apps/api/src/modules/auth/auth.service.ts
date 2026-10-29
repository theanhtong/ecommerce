import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role, UserStatus } from '@marketplace/db';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { latestReason } from '../../common/moderation.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AUTH_CONFIG, type AuthConfig } from './auth.config.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  sid: string;
}

export interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

@Injectable()
export class AuthService {
  // Keeps login timing equal for unknown emails.
  private readonly dummyHash = argon2.hash(randomBytes(32));

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async register(dto: RegisterDto, meta: ClientMeta): Promise<IssuedTokens> {
    const passwordHash = await argon2.hash(dto.password);
    try {
      const user = await this.prisma.user.create({
        data: { email: dto.email, username: dto.username, passwordHash },
      });
      return await this.startSession(user, meta);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const emailTaken = await this.prisma.user.count({
          where: { email: dto.email },
        });
        throw new ConflictException(
          emailTaken ? 'Email already registered' : 'Username already taken',
        );
      }
      throw error;
    }
  }

  async login(dto: LoginDto, meta: ClientMeta): Promise<IssuedTokens> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    const valid = await argon2.verify(
      user?.passwordHash ?? (await this.dummyHash),
      dto.password,
    );
    if (!user || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    // Only someone who knows the password learns the account is banned, and why.
    if (user.status !== UserStatus.active) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Account is banned',
        reason: await latestReason(
          this.prisma,
          { userId: user.id },
          user.status,
        ),
      });
    }
    return this.startSession(user, meta);
  }

  async refresh(refreshToken: string, meta: ClientMeta): Promise<IssuedTokens> {
    const presentedHash = sha256(refreshToken);
    const session = await this.prisma.session.findFirst({
      where: {
        OR: [
          { tokenHash: presentedHash },
          { previousTokenHash: presentedHash },
        ],
      },
      include: { user: true },
    });
    if (!session) throw new UnauthorizedException();

    if (session.previousTokenHash === presentedHash) {
      await this.revoke(session.id);
      throw new UnauthorizedException();
    }
    if (
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== UserStatus.active
    ) {
      throw new UnauthorizedException();
    }

    const nextToken = randomBytes(32).toString('base64url');
    // A concurrent refresh with the same token gets count 0 and is treated as reuse.
    const { count } = await this.prisma.session.updateMany({
      where: { id: session.id, tokenHash: presentedHash, revokedAt: null },
      data: {
        tokenHash: sha256(nextToken),
        previousTokenHash: presentedHash,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    if (count === 0) {
      await this.revoke(session.id);
      throw new UnauthorizedException();
    }

    return {
      accessToken: await this.signAccessToken(session.user, session.id),
      refreshToken: nextToken,
      refreshExpiresAt: session.expiresAt,
    };
  }

  async revokeUserSessions(
    userId: string,
    exceptSessionId?: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await tx.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        id: exceptSessionId ? { not: exceptSessionId } : undefined,
      },
      data: { revokedAt: new Date() },
    });
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.prisma.session.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async startSession(
    user: { id: string; role: Role },
    meta: ClientMeta,
  ): Promise<IssuedTokens> {
    const refreshToken = randomBytes(32).toString('base64url');
    const refreshExpiresAt = new Date(
      Date.now() + this.config.refreshTtlDays * 24 * 60 * 60 * 1000,
    );
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        expiresAt: refreshExpiresAt,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    return {
      accessToken: await this.signAccessToken(user, session.id),
      refreshToken,
      refreshExpiresAt,
    };
  }

  private signAccessToken(user: { id: string; role: Role }, sessionId: string) {
    const payload: AccessTokenPayload = {
      sub: user.id,
      role: user.role,
      sid: sessionId,
    };
    return this.jwt.signAsync(payload);
  }

  private async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
