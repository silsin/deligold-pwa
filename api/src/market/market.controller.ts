import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { MarketService } from './market.service';
import { TRADE_SYMBOLS } from './symbols';

/**
 * The public price board.
 *
 * Every route here is `@Public()`: a signed-out visitor browsing the app needs
 * prices, and refusing to show them until they register would make the landing
 * screen useless. Nothing here is user-specific or secret.
 */
@Controller('market')
export class MarketController {
  constructor(private readonly market: MarketService) {}

  /**
   * The live board plus the symbol catalogue, in the shape the PWA's market
   * store already expects (`quotes` keyed by symbol).
   */
  @Public()
  @Get('board')
  async board() {
    const b = await this.market.board();
    return {
      symbols: TRADE_SYMBOLS,
      quotes: b.quotes,
      source: b.source,
      updatedAt: b.updatedAt,
      stale: b.stale,
    };
  }
}
