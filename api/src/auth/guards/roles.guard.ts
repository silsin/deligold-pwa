import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ForbiddenError } from '../../common/errors';
import { RANK } from '../roles';
import { IS_PUBLIC_KEY } from '../public.decorator';
import { ROLES_KEY } from '../roles.decorator';

/**
 * Enforces the role rules from `roles.ts` on every route.
 *
 * Runs after JwtAuthGuard, so `request.user` is already populated. Three cases:
 *
 *  - `@Public()`  → skip entirely; there may be no user at all.
 *  - no `@Roles()` → any signed-in user, of any role, may call.
 *  - `@Roles()`   → the caller's rank must be at or above the *lowest* role
 *    listed. Requiring BROKER_ADMIN admits BROKER_ADMIN and SUPER_ADMIN, so a
 *    platform owner is never locked out of an operator's screen.
 *
 * The lowest-listed-role rule is deliberate: it matches how the hierarchy in
 * `roles.ts` is defined, and it means adding a higher role to a decorator can
 * only ever widen access, never accidentally narrow it.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const user = context.switchToHttp().getRequest().user as
      | { role?: Role }
      | undefined;

    if (!user?.role) {
      throw new ForbiddenError('برای این بخش باید وارد شوید');
    }

    // The weakest required role sets the bar; anything at or above passes.
    const threshold = Math.min(...required.map(r => RANK[r]));
    if (RANK[user.role] < threshold) {
      throw new ForbiddenError('سطح دسترسی شما برای این بخش کافی نیست');
    }
    return true;
  }
}
