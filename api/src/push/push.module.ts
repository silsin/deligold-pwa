import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PushController } from './push.controller';
import { PushService } from './push.service';

/**
 * Web Push / VAPID notification module.
 *
 * Exports PushService so TradingModule, WalletsModule, AuthModule, and
 * UsersModule can inject it for fire-and-forget event notifications.
 */
@Module({
  imports: [PrismaModule],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
