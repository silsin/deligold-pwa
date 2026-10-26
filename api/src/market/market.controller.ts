import { Body, Controller, Delete, Get, Param, Put, Query } from '@nestjs/common';
import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';
import { Role } from '@prisma/client';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { MarketService } from './market.service';
import { TRADE_SYMBOLS } from './symbols';

/** Staff allowed to set the board prices. Lowest role sets the bar (see RolesGuard). */
const STAFF = [Role.BROKER_MANAGER, Role.BROKER_ADMIN, Role.SUPER_ADMIN] as const;

/**
 * One symbol's manual price. Every field is optional so a manager can set just a
 * buy and sell (mid derived), or close a single side via allowBuy/allowSell.
 * Sending no numbers at all leaves the symbol untouched rather than blanking it.
 */
class SetPriceDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  buy?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sell?: number;

  /** False reverts this symbol to the live feed without deleting the row. */
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  allowBuy?: boolean;

  @IsOptional()
  @IsBoolean()
  allowSell?: boolean;
}

/**
 * The public price board.
 *
 * `GET /board` is `@Public()`: a signed-out visitor browsing the app needs
 * prices, and refusing to show them until they register would make the landing
 * screen useless. Nothing on it is user-specific or secret.
 *
 * `GET/PUT/DELETE /prices…` are the broker manager's manual override of that
 * board — guarded by `@Roles(STAFF)` so a customer can never set the number they
 * trade against. Those overrides are layered over the feed inside
 * `MarketService.applyOverrides`, so the customer board and the order-fill price
 * stay the same reading.
 */
@Controller('market')
export class MarketController {
  constructor(private readonly market: MarketService) {}

  /**
   * The live board plus the symbol catalogue, in the shape the PWA's market
   * store already expects (`quotes` keyed by symbol).
   *
   * An optional `?brokerId=` switches to the broker-scoped board, where each
   * symbol's buy/sell is recomputed from the broker's pricing-rule margins on
   * top of the live raw price — so a customer sees and trades at their broker's
   * numbers rather than the raw feed.
   */
  @Public()
  @Get('board')
  async board(@Query('brokerId') brokerId?: string) {
    const b = brokerId ? await this.market.boardForBroker(brokerId) : await this.market.board();
    return {
      symbols: TRADE_SYMBOLS,
      quotes: b.quotes,
      source: b.source,
      updatedAt: b.updatedAt,
      stale: b.stale,
      // Optional, added for the multi-source feed so the board can explain
      // itself ("some rates filled from backup") without changing the shape
      // the PWA store already expects.
      note: b.note,
      staleRates: b.staleRates,
    };
  }

  /**
   * The board for the signed-in user, priced at *their* tier (trusted — read
   * from the JWT, never the client). A broker manager sees the BROKER_MANAGER
   * margin their admin set; a customer (and a broker admin) sees the CUSTOMER
   * tier; a super admin with no broker sees the raw feed.
   */
  @Get('board/me')
  async boardForMe(@CurrentUser() user: AuthUser) {
    const b = user?.brokerId
      ? await this.market.boardForBroker(user.brokerId, user.role)
      : await this.market.board();
    return {
      symbols: TRADE_SYMBOLS,
      quotes: b.quotes,
      source: b.source,
      updatedAt: b.updatedAt,
      stale: b.stale,
      note: b.note,
      staleRates: b.staleRates,
    };
  }

  /** Every manual override, for the manager's setup screen. Staff only. */
  @Roles(...STAFF)
  @Get('prices')
  listPrices() {
    return this.market.listOverrides();
  }

  /**
   * Create or replace one symbol's manual price. Staff only. Takes effect on the
   * customer board immediately (the feed cache is invalidated on write).
   */
  @Roles(...STAFF)
  @Put('prices/:symbol')
  setPrice(@CurrentUser() user: AuthUser, @Param('symbol') symbol: string, @Body() dto: SetPriceDto) {
    return this.market.setOverride(user.userId, symbol, dto);
  }

  /** Drop a symbol's override so it follows the live feed again. Staff only. */
  @Roles(...STAFF)
  @Delete('prices/:symbol')
  clearPrice(@Param('symbol') symbol: string) {
    return this.market.clearOverride(symbol);
  }
}
