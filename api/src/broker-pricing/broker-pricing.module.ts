import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MarketModule } from '../market/market.module';
import { BrokerPricingController } from './broker-pricing.controller';
import { BrokerPricingService } from './broker-pricing.service';

/**
 * Per-broker pricing rules.
 *
 * Imports `MarketModule` so the service can invalidate the feed cache after a
 * write — the customer board then reflects the new margins on the next read.
 * `MarketService` does NOT import this module (it queries `BrokerPriceRule`
 * rows through Prisma directly), which keeps the dependency one-way and avoids
 * a cycle.
 */
@Module({
  imports: [PrismaModule, MarketModule],
  controllers: [BrokerPricingController],
  providers: [BrokerPricingService],
  exports: [BrokerPricingService],
})
export class BrokerPricingModule {}
