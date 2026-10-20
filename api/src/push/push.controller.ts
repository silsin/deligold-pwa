import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { PushService } from './push.service';
import { SubscribeDto, UnsubscribeDto } from './dto/push.dto';

/**
 * Push notification endpoints.
 *
 * GET  /push/vapid-public-key  — public, returns the VAPID public key so the
 *                                PWA can call PushManager.subscribe before login.
 * POST /push/subscribe          — register/update a push subscription for this user.
 * DELETE /push/unsubscribe      — remove a push subscription for this user.
 */
@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  /** Returns the VAPID public key. No auth required — the key is meant to be distributed. */
  @Public()
  @Get('vapid-public-key')
  vapidPublicKey() {
    return { publicKey: this.push.getVapidPublicKey() };
  }

  /** Registers or updates a push subscription for the authenticated user. */
  @Post('subscribe')
  @HttpCode(200)
  subscribe(@CurrentUser() user: AuthUser, @Body() dto: SubscribeDto) {
    return this.push.subscribe(user.userId, dto).then(() => ({ ok: true }));
  }

  /** Removes a push subscription for the authenticated user. */
  @Delete('unsubscribe')
  @HttpCode(200)
  unsubscribe(@CurrentUser() user: AuthUser, @Body() dto: UnsubscribeDto) {
    return this.push.unsubscribe(user.userId, dto.endpoint).then(() => ({ ok: true }));
  }
}
