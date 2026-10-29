import { applyDecorators, UseGuards } from '@nestjs/common';
import { Role } from '@marketplace/db';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { RolesGuard } from '../guards/roles.guard.js';
import { Roles } from './roles.decorator.js';

// Admins run the platform; buying and selling is for regular users only.
export const MemberOnly = () =>
  applyDecorators(UseGuards(JwtAuthGuard, RolesGuard), Roles(Role.user));
