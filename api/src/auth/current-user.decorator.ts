import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';

/**
 * The authenticated user, injected straight into a handler argument.
 *
 * JwtAuthGuard puts the decoded token payload on `request.user`; this decorator
 * returns it typed, so a handler reads:
 *
 *   @Get('me')
 *   me(@CurrentUser() user: AuthUser) { return user; }
 *
 * `role` is the Prisma `Role`, not a bare string: the JWT strategy signs the
 * role a user had at login, which came from the database as a `Role`, so the
 * decoded claim is one too. Typing it as `Role` is what lets the guards and
 * services compare ranks without a cast on every call.
 *
 * Only call it on a route that is *not* `@Public()` — on a public route there is
 * no user and the value is `undefined`.
 */
export interface AuthUser {
  /** User id — the `sub` claim. */
  userId: string;
  role: Role;
  brokerId: string | null;
  /** Denormalised so guards never need a database hit per request. */
  name: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined =>
    ctx.switchToHttp().getRequest().user,
);
