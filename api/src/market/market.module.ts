import { Module } from '@nestjs/common';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';

/**
 * Live pricing. Exported rather than kept private, because the trading module
 * must fill orders from the *same* reading the board shows — if each service
 * fetched its own price, a customer could see one number and be filled at
 * another.
 */
@Module({
  controllers: [MarketController],
  providers: [MarketService],
  exports: [MarketService],
})
export class MarketModule {}
