import * as bcrypt from 'bcrypt';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { AuthResponse } from './interfaces/auth-response.interface.js';
import { JwtPayload } from './interfaces/jwt-payload.interface.js';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { randomBytes } from 'crypto';
import { uuidv7 } from 'uuidv7';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mailService: MailService,
  ) {}

  async register(dto: RegisterDto): Promise<{ message: string }> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already exists');

    const hashed = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        id: uuidv7(),
        email: dto.email,
        password: hashed,
        name: dto.name,
      },
    });

    const token = randomBytes(32).toString('hex');

    await this.prisma.emailVerification.create({
      data: {
        id: uuidv7(),
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
      },
    });

    await this.mailService.sendVerificationEmail(user.email, user.name, token);

    return {
      message:
        'Registration successful. Please check your email to verify your account.',
    };
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    const record = await this.prisma.emailVerification.findUnique({
      where: { token },
    });

    if (!record) throw new NotFoundException('Invalid verification token');
    if (record.expiresAt < new Date())
      throw new BadRequestException('Token expired');

    await this.prisma.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date() },
    });

    await this.prisma.emailVerification.delete({ where: { token } });

    return { message: 'Email verified successfully. You can now login.' };
  }

  async login(
    dto: LoginDto,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || !user.password)
      throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (!user.isActive) throw new UnauthorizedException('Account is disabled');

    if (!user.emailVerifiedAt)
      throw new UnauthorizedException(
        'Please verify your email before logging in',
      );

    return this.generateTokens(user.id, user.email, user.role, ip, userAgent);
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.prisma.session.findFirst({
      where: { userId: payload.sub },
    });
    if (!session) throw new UnauthorizedException('Session not found');

    const valid = await bcrypt.compare(refreshToken, session.token);
    if (!valid) throw new UnauthorizedException('Invalid refresh token');

    await this.prisma.session.delete({ where: { id: session.id } });

    return this.generateTokens(payload.sub, payload.email, payload.role);
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId } });
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: string,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthResponse> {
    const payload: JwtPayload = { sub: userId, email, role };

    const accessToken = this.jwt.sign(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: '15m',
    });

    const refreshToken = this.jwt.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '7d',
    });

    const hashedRt = await bcrypt.hash(refreshToken, 10);

    await this.prisma.session.create({
      data: {
        id: uuidv7(),
        userId,
        token: hashedRt,
        ipAddress: ip,
        userAgent,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken, refreshToken };
  }
}
