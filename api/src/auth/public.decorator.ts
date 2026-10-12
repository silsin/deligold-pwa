import { SetMetadata } from '@nestjs/common';

/**
 * Marks a route as reachable without a token.
 *
 * Both global guards skip it: JwtAuthGuard so no `Authorization` header is
 * required, and RolesGuard because there is no user to check a role against.
 * Used by registration, login and the public price board.
 *
 *   @Public()
 *   @Post('register')
 *   register() { ... }
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
