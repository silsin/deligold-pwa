import { Body, Controller, Delete, Get, Param, Put, Query } from '@nestjs/common';
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
 * Rules are tiered by who they price: the CUSTOMER tier (manager→customer) and
 * the BROKER_MANAGER tier (broker-admin→manager). The service enforces who may
 * write which tier.
 *
 * The board itself is produced by `MarketService.boardForBroker`, which reads
 * these rows straight from Prisma; this controller only writes them and lets
 * `MarketService.invalidate()` push the change to the customer board on the
 * next read.
 */
@Controller('broker-pricing')
export class BrokerPricingController {
  constructor(private readonly pricing: BrokerPricingService) {}

  /** Every rule for the actor's broker (all tiers for an admin / super-admin).
   *  A manager only ever receives the CUSTOMER tier. Staff only. */
  @Roles(...STAFF)
  @Get()
  list(@CurrentUser() user: AuthUser, @Query('targetRole') targetRole?: string): Promise<PriceRuleView[]> {
    return this.pricing.listRules(user, targetRole);
  }

  /** Create or replace one symbol's margin rule for a tier. Staff only. */
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
    return this.pricing.setRule(user, symbol, input, dto.targetRole);
  }

  /** Drop a symbol's rule for a tier so it follows the live feed again. Staff only. */
  @Roles(...STAFF)
  @Delete(':symbol')
  clear(
    @CurrentUser() user: AuthUser,
    @Param('symbol') symbol: string,
    @Query('targetRole') targetRole?: string,
  ): Promise<void> {
    return this.pricing.clearRule(user, symbol, targetRole);
  }
}
