import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@ecommerce/db';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuthService } from '../auth/auth.service.js';
import type { ChangePasswordDto } from './dto/change-password.dto.js';
import type { ListUsersQuery } from './dto/list-users.query.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';

const profileSelect = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  status: true,
  createdAt: true,
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
    try {
      return await this.prisma.user.update({
        where: { id: userId, status: UserStatus.active },
        data: { displayName: dto.displayName },
        select: profileSelect,
      });
    } catch (error) {
      if (isNotFound(error)) throw new UnauthorizedException();
      throw error;
    }
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

  async list(query: ListUsersQuery) {
    const users = await this.prisma.user.findMany({
      where: { status: query.status },
      select: profileSelect,
      orderBy: { id: 'asc' },
      take: query.limit + 1,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
    });
    const hasMore = users.length > query.limit;
    const items = hasMore ? users.slice(0, query.limit) : users;
    return { items, nextCursor: hasMore ? items.at(-1)!.id : null };
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
