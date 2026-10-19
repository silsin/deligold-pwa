import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MarketService } from '../market/market.service';
import { TradeError } from '../common/errors';
import { isTradeSymbol } from '../market/symbols';

/**
 * One broker's margin rule for a symbol, flattened for the client. Prisma
 * `Decimal` fields become plain numbers so the PWA never parses a decimal string.
 */
export interface PriceRuleView {
  symbol: string;
  enabled: boolean;
  allowBuy: boolean;
  allowSell: boolean;
  buyMarginToman: number;
  sellMarginToman: number;
  buyMarginPercent: number;
  sellMarginPercent: number;
  updatedAt: Date;
}

/** The staff roles allowed to manage a broker's pricing rules. */
const STAFF_ROLES = new Set<Role>([Role.BROKER_MANAGER, Role.BROKER_ADMIN, Role.SUPER_ADMIN]);

/** Shape of the write payload accepted by `setRule`. */
export interface SetRuleInput {
  enabled?: boolean;
  allowBuy?: boolean;
  allowSell?: boolean;
  buyMarginToman?: number | null;
  sellMarginToman?: number | null;
  buyMarginPercent?: number | null;
  sellMarginPercent?: number | null;
}

/**
 * Per-broker pricing rules.
 *
 * A broker manager layers a margin (fixed Toman and/or a percent) on top of
 * the live raw price for each symbol, so the buy/sell their customers trade at
 * is derived from one shared market reading rather than typed in by hand.
 * `MarketService.boardForBroker` reads these rows directly to adjust the
 * board — this service never touches the board itself, it just invalidates
 * the feed cache after a write so the next read reflects the change at once.
 */
@Injectable()
export class BrokerPricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly market: MarketService,
  ) {}

  /**
   * Every rule for the actor's broker, newest-first. A SUPER_ADMIN (no broker
   * of their own) sees every rule across the platform for oversight.
   */
  async listRules(actor: { role: Role; brokerId: string | null }): Promise<PriceRuleView[]> {
    const where = actor.role === Role.SUPER_ADMIN || !actor.brokerId ? {} : { brokerId: actor.brokerId };
    const rows = await this.prisma.brokerPriceRule.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(r => this.view(r));
  }

  /**
   * Create or replace a symbol's margin rule for the actor's broker.
   *
   * Broker-manager/admin only in practice: a SUPER_ADMIN has no broker of their
   * own, so they cannot set a rule through this endpoint (they oversee instead).
   * Enforced by `@Roles(STAFF)` on the controller and by the broker requirement
   * here — a rule must belong to a real broker.
   */
  async setRule(
    actor: { userId: string; role: Role; brokerId: string | null },
    symbol: string,
    input: SetRuleInput,
  ): Promise<PriceRuleView> {
    if (!isTradeSymbol(symbol)) throw new TradeError('نماد معاملاتی نامعتبر است');
    if (!actor.brokerId) throw new TradeError('سازمان شما مشخص نیست', 400);

    const toDec = (v: number | null | undefined) =>
      v == null ? new Prisma.Decimal(0) : new Prisma.Decimal(Math.max(0, Number(v) || 0));

    const data = {
      enabled: input.enabled ?? true,
      allowBuy: input.allowBuy ?? true,
      allowSell: input.allowSell ?? true,
      buyMarginToman: toDec(input.buyMarginToman),
      sellMarginToman: toDec(input.sellMarginToman),
      buyMarginPercent: toDec(input.buyMarginPercent),
      sellMarginPercent: toDec(input.sellMarginPercent),
      updatedById: actor.userId,
    };

    const row = await this.prisma.brokerPriceRule.upsert({
      where: { brokerId_symbol: { brokerId: actor.brokerId, symbol } },
      create: { brokerId: actor.brokerId, symbol, ...data },
      update: data,
    });

    // The broker-scoped board changed — drop the cache so the next read shows it.
    this.market.invalidate();
    return this.view(row);
  }

  /** Remove a symbol's rule so it falls back to the live feed. */
  async clearRule(actor: { role: Role; brokerId: string | null }, symbol: string): Promise<void> {
    if (!isTradeSymbol(symbol)) throw new TradeError('نماد معاملاتی نامعتبر است');
    if (!actor.brokerId) throw new TradeError('سازمان شما مشخص نیست', 400);

    await this.prisma.brokerPriceRule.deleteMany({
      where: { brokerId: actor.brokerId, symbol },
    });
    this.market.invalidate();
  }

  /**
   * Every enabled rule for a broker, as a map keyed by symbol. Read by
   * `MarketService.boardForBroker` to adjust the board — queried through
   * Prisma directly to avoid a MarketService → BrokerPricingService cycle.
   */
  async getRulesForBroker(brokerId: string): Promise<Map<string, PriceRuleView>> {
    const rows = await this.prisma.brokerPriceRule.findMany({
      where: { brokerId, enabled: true },
    });
    return new Map(rows.map(r => [r.symbol, this.view(r)]));
  }

  /** Prisma Decimal → plain number, defaults kept as 0 (not null). */
  private view(r: Prisma.BrokerPriceRuleGetPayload<Record<string, never>>): PriceRuleView {
    const num = (v: Prisma.Decimal) => (v == null ? 0 : Number(v));
    return {
      symbol: r.symbol,
      enabled: r.enabled,
      allowBuy: r.allowBuy,
      allowSell: r.allowSell,
      buyMarginToman: num(r.buyMarginToman),
      sellMarginToman: num(r.sellMarginToman),
      buyMarginPercent: num(r.buyMarginPercent),
      sellMarginPercent: num(r.sellMarginPercent),
      updatedAt: r.updatedAt,
    };
  }
}

export const BROKER_PRICING_STAFF_ROLES = STAFF_ROLES;
