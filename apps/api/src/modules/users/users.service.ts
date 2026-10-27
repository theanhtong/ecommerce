import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@ecommerce/db';
import * as argon2 from 'argon2';
import { withinChangeCooldown } from '../../common/cooldown.js';
import { cursorArgs, toPage } from '../../common/pagination.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuthService } from '../auth/auth.service.js';
import type { ChangePasswordDto } from './dto/change-password.dto.js';
import type { ListUsersQuery } from './dto/list-users.query.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';

const profileSelect = {
  id: true,
  email: true,
  username: true,
  usernameChangedAt: true,
  role: true,
  status: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

const adminSelect = {
  ...profileSelect,
  shop: { select: { id: true, name: true, status: true } },
} satisfies Prisma.UserSelect;

const isNotFound = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2025';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, status: UserStatus.active },
      select: profileSelect,
    });
    if (!user) throw new UnauthorizedException();
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.getProfile(userId);
    if (dto.username === undefined || dto.username === user.username) {
      return user;
    }
    const now = new Date();
    if (withinChangeCooldown(user.usernameChangedAt, now)) {
      throw new ConflictException(
        'Username can only be changed once every 30 days',
      );
    }
    try {
      // Matching the previous change time makes concurrent changes race-safe.
      const { count } = await this.prisma.user.updateMany({
        where: { id: userId, usernameChangedAt: user.usernameChangedAt },
        data: { username: dto.username, usernameChangedAt: now },
      });
      if (count === 0) throw new ConflictException('Username changed, retry');
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Username already taken');
      }
      throw error;
    }
    return this.getProfile(userId);
  }

  async changePassword(
    userId: string,
    sessionId: string,
    dto: ChangePasswordDto,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, status: UserStatus.active },
    });
    if (!user) throw new UnauthorizedException();
    if (!(await argon2.verify(user.passwordHash, dto.currentPassword))) {
      throw new BadRequestException('Current password is incorrect');
    }
    const passwordHash = await argon2.hash(dto.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await this.auth.revokeUserSessions(userId, sessionId, tx);
    });
  }

  async getForAdmin(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...adminSelect,
        _count: { select: { orders: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    const { _count, ...profile } = user;
    return { ...profile, orderCount: _count.orders };
  }

  async list(query: ListUsersQuery) {
    const users = await this.prisma.user.findMany({
      where: {
        status: query.status,
        role: query.role,
        ...(query.shop && {
          shop: query.shop === 'with' ? { isNot: null } : { is: null },
        }),
      },
      select: { ...adminSelect, _count: { select: { orders: true } } },
      ...cursorArgs(query),
    });
    const page = toPage(users, query.limit);
    return {
      ...page,
      items: page.items.map(({ _count, ...user }) => ({
        ...user,
        orderCount: _count.orders,
      })),
    };
  }

  async updateStatus(actorId: string, userId: string, status: UserStatus) {
    if (actorId === userId) {
      throw new BadRequestException('Cannot change your own status');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: userId },
          data: { status },
          select: profileSelect,
        });
        if (status === UserStatus.banned) {
          await this.auth.revokeUserSessions(userId, undefined, tx);
        }
        return user;
      });
    } catch (error) {
      if (isNotFound(error)) throw new NotFoundException('User not found');
      throw error;
    }
  }
}
