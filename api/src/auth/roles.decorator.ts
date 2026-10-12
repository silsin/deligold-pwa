import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

/**
 * Marks a handler or controller with the roles allowed to call it.
 *
 * Consumed by RolesGuard. A route with no decorator is reachable by any
 * authenticated user; a route that needs no account at all must also be marked
 * `@Public()`, because JwtAuthGuard runs first.
 *
 *   @Roles(Role.BROKER_MANAGER, Role.BROKER_ADMIN)
 *   @Get('review-queue')
 *   queue() { ... }
 */
export const ROLES_KEY = 'requiredRoles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
