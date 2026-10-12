import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountingModule } from '../accounting/accounting.module';
import { MarketModule } from '../market/market.module';
import { TradingController } from './trading.controller';
import { TradingService } from './trading.service';

/**
 * Trading: order placement, the wallet/position reads, and the broker manager's
 * receipt-review queue.
 *
 * Depends on MarketModule for the fill price and AccountingModule for the
 * double-entry posting, so a trade updates the books and the board from one
 * shared source rather than each service keeping its own copy of a price.
 */
@Module({
  imports: [PrismaModule, AccountingModule, MarketModule],
  controllers: [TradingController],
  providers: [TradingService],
  exports: [TradingService],
})
export class TradingModule {}
