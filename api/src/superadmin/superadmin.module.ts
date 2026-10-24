import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MarketModule } from '../market/market.module';
import { SuperadminController } from './superadmin.controller';
import { SuperadminService } from './superadmin.service';

/**
 * Super-admin platform administration: price source management, the live
 * price-tick feed, and the cross-platform trade explorer.
 *
 * Imports MarketModule to reuse the source cache (writes invalidate it) and the
 * tick query.
 */
@Module({
  imports: [PrismaModule, MarketModule],
  controllers: [SuperadminController],
  providers: [SuperadminService],
})
export class SuperadminModule {}
