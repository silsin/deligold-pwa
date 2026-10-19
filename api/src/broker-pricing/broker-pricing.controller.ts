import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { BrokerPricingService, PriceRuleView, SetRuleInput } from './broker-pricing.service';
import { SetRuleDto } from './dto/broker-pricing.dto';

/** Staff allowed to manage a broker's pricing rules. Lowest role sets the bar. */
const STAFF = [Role.BROKER_MANAGER, Role.BROKER_ADMIN, Role.SUPER_ADMIN] as const;

/**
 * A broker's pricing rules — the margin each symbol trades at, layered over
 * the live raw price. Every route is staff-only: customers never set the
 * numbers they trade against.
 *
 * The board itself is produced by `MarketService.boardForBroker`, which reads
 * these rows straight from Prisma; this controller only writes them and lets
 * `MarketService.invalidate()` push the change to the customer board on the
 * next read.
 */
@Controller('broker-pricing')
export class BrokerPricingController {
  constructor(private readonly pricing: BrokerPricingService) {}

  /** Every rule for the actor's broker (all rules for a super-admin). Staff only. */
  @Roles(...STAFF)
  @Get()
  list(@CurrentUser() user: AuthUser): Promise<PriceRuleView[]> {
    return this.pricing.listRules(user);
  }

  /** Create or replace one symbol's margin rule. Staff only. */
  @Roles(...STAFF)
  @Put(':symbol')
  set(
    @CurrentUser() user: AuthUser,
    @Param('symbol') symbol: string,
    @Body() dto: SetRuleDto,
  ): Promise<PriceRuleView> {
    const input: SetRuleInput = {
      enabled: dto.enabled,
      allowBuy: dto.allowBuy,
      allowSell: dto.allowSell,
      buyMarginToman: dto.buyMarginToman,
      sellMarginToman: dto.sellMarginToman,
      buyMarginPercent: dto.buyMarginPercent,
      sellMarginPercent: dto.sellMarginPercent,
    };
    return this.pricing.setRule(user, symbol, input);
  }

  /** Drop a symbol's rule so it follows the live feed again. Staff only. */
  @Roles(...STAFF)
  @Delete(':symbol')
  clear(@CurrentUser() user: AuthUser, @Param('symbol') symbol: string): Promise<void> {
    return this.pricing.clearRule(user, symbol);
  }
}
