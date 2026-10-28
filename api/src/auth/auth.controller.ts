import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';
import { CurrentUser, type AuthUser } from './current-user.decorator';
import { Public } from './public.decorator';
import { JoinInviteDto, LoginDto, RefreshDto, RegisterDto } from './dto/auth.dto';

/**
 * Authentication endpoints.
 *
 * `POST /auth/register` and `POST /auth/login` are `@Public()` â€” they are the
 * only routes a signed-out visitor needs. Everything else runs behind the
 * global JWT guard.
 *
 * The response shape is `{ success, data }`, matching what the PWA's axios
 * interceptor already unwraps.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Self-registration â€” anyone in the app can create an account, which is why
   * this is public. The controller deliberately ignores any `role` in the body
   * unless the caller is already signed in and outranks it, so a stranger can
   * never sign themselves up as staff.
   */
  @Public()
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @CurrentUser() actor?: AuthUser) {
    return this.auth.register(dto, actor ? { userId: actor.userId, role: actor.role as Role } : undefined);
  }

  /**
   * Phone + password. Returns the access/refresh pair the PWA stores.
   * Tightly throttled â€” 5 attempts per minute per IP to stop brute force.
   */
  @Public()
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  /** Swaps a refresh token for a new pair, rotating the old one away. */
  @Public()
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  /** Signs out this device by deleting its refresh token. */
  @Public()
  @Post('logout')
  async logout(@Body() dto: RefreshDto) {
    await this.auth.logout(dto.refreshToken);
    return { ok: true };
  }

  /**
   * A signed-in customer joins a broker with an invite code (scanned QR or
   * typed). Returns a fresh token pair, since the broker is carried in the JWT.
   */
  @Post('join-invite')
  joinInvite(@CurrentUser() user: AuthUser, @Body() dto: JoinInviteDto) {
    return this.auth.joinBroker(user, dto.code);
  }

  /** The signed-in user's own profile, including their verification badge. */
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.userId);
  }
}

/**
 * Authentication endpoints.
 *
 * `POST /auth/register` and `POST /auth/login` are `@Public()` â€” they are the
 * only routes a signed-out visitor needs. Everything else runs behind the
 * global JWT guard.
 *
 * The response shape is `{ success, data }`, matching what the PWA's axios
 * interceptor already unwraps.
 */
