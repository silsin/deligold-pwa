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
  /** Which role tier this rule prices: "CUSTOMER" | "BROKER_MANAGER". */
  targetRole: string;
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

/** Price tiers. CUSTOMER is the manager→customer layer (the original one);
 *  BROKER_MANAGER is the broker-admin→manager layer (one rung up the hierarchy). */
export type PriceTier = 'CUSTOMER' | 'BROKER_MANAGER';
const VALID_TIERS = new Set<PriceTier>(['CUSTOMER', 'BROKER_MANAGER']);

/** The tier a user of `role` trades at — their own price. A broker manager
 *  gets their own tier; everyone else (customer, broker admin, super admin)
 *  trades at the CUSTOMER tier. */
export function tierForRole(role: Role | string): PriceTier {
  return role === Role.BROKER_MANAGER || role === 'BROKER_MANAGER' ? 'BROKER_MANAGER' : 'CUSTOMER';
}

/** Normalize and validate a requested tier, defaulting to CUSTOMER. */
function normalizeTier(t: string | undefined | null): PriceTier {
  return t && VALID_TIERS.has(t as PriceTier) ? (t as PriceTier) : 'CUSTOMER';
}

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
 * Per-broker pricing rules, tiered by role.
 *
 * A broker manager layers a margin on top of the live raw price for their
 * *customers* (the CUSTOMER tier). A broker admin can do that too, and can also
 * set a separate margin for their *broker managers* (the BROKER_MANAGER tier) —
 * the same mechanism one rung up the hierarchy, so an admin controls the price
 * both their managers and their customers trade at.
 *
 * `MarketService.boardForBroker` reads these rows directly to adjust the board
 * for the requesting user's tier — this service never touches the board itself,
 * it just invalidates the feed cache after a write so the next read reflects it.
 */
@Injectable()
export class BrokerPricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly market: MarketService,
  ) {}

  /**
   * Every rule for the actor's broker (all tiers for an admin / super admin).
   * A broker manager only ever sees the CUSTOMER tier — they cannot read or
   * edit the margin their admin set for them.
   */
  async listRules(
    actor: { role: Role; brokerId: string | null },
    targetRole?: string,
  ): Promise<PriceRuleView[]> {
    const where: Prisma.BrokerPriceRuleWhereInput =
      actor.role === Role.SUPER_ADMIN || !actor.brokerId ? {} : { brokerId: actor.brokerId };

    // A manager is confined to the customer tier, regardless of what they ask for.
    if (actor.role === Role.BROKER_MANAGER) {
      where.targetRole = 'CUSTOMER';
    } else if (targetRole) {
      where.targetRole = normalizeTier(targetRole);
    }

    const rows = await this.prisma.brokerPriceRule.findMany({
      where,
      orderBy: [{ targetRole: 'asc' }, { updatedAt: 'desc' }],
    });
    return rows.map(r => this.view(r));
  }

  /**
   * Create or replace a symbol's margin rule for a tier.
   *
   * CUSTOMER tier: any staff (manager / admin / super) may set it.
   * BROKER_MANAGER tier: only a broker admin or super admin may set it — a
   * broker manager cannot price themselves.
   */
  async setRule(
    actor: { userId: string; role: Role; brokerId: string | null },
    symbol: string,
    input: SetRuleInput,
    targetRole?: string,
  ): Promise<PriceRuleView> {
    if (!isTradeSymbol(symbol)) throw new TradeError('نماد معاملاتی نامعتبر است');
    if (!actor.brokerId) throw new TradeError('سازمان شما مشخص نیست', 400);

    const tier = normalizeTier(targetRole);
    if (tier === 'BROKER_MANAGER' && actor.role !== Role.BROKER_ADMIN && actor.role !== Role.SUPER_ADMIN) {
      throw new TradeError('تنها مدیر ارشد کارگزاری می‌تواند قیمت مدیران را تنظیم کند', 403);
    }

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
      where: { brokerId_symbol_targetRole: { brokerId: actor.brokerId, symbol, targetRole: tier } },
      create: { brokerId: actor.brokerId, symbol, targetRole: tier, ...data },
      update: data,
    });

    // The broker-scoped board changed — drop the cache so the next read shows it.
    this.market.invalidate();
    return this.view(row);
  }

  /** Remove a symbol's rule for a tier so it follows the live feed again. */
  async clearRule(
    actor: { role: Role; brokerId: string | null },
    symbol: string,
    targetRole?: string,
  ): Promise<void> {
    if (!isTradeSymbol(symbol)) throw new TradeError('نماد معاملاتی نامعتبر است');
    if (!actor.brokerId) throw new TradeError('سازمان شما مشخص نیست', 400);

    const tier = normalizeTier(targetRole);
    if (tier === 'BROKER_MANAGER' && actor.role !== Role.BROKER_ADMIN && actor.role !== Role.SUPER_ADMIN) {
      throw new TradeError('تنها مدیر ارشد کارگزاری می‌تواند قیمت مدیران را تغییر دهد', 403);
    }

    await this.prisma.brokerPriceRule.deleteMany({
      where: { brokerId: actor.brokerId, symbol, targetRole: tier },
    });
    this.market.invalidate();
  }

  /**
   * Every enabled rule for a broker at a given user's tier, as a map keyed by
   * symbol. Read by `MarketService.boardForBroker` to adjust the board for that
   * user's tier — queried through Prisma directly to avoid a MarketService cycle.
   */
  async getRulesForBroker(brokerId: string, role?: Role): Promise<Map<string, PriceRuleView>> {
    const where: Prisma.BrokerPriceRuleWhereInput = { brokerId, enabled: true };
    if (role) where.targetRole = tierForRole(role);
    const rows = await this.prisma.brokerPriceRule.findMany({ where });
    return new Map(rows.map(r => [r.symbol, this.view(r)]));
  }

  /** Prisma Decimal → plain number, defaults kept as 0 (not null). */
  private view(r: Prisma.BrokerPriceRuleGetPayload<Record<string, never>>): PriceRuleView {
    const num = (v: Prisma.Decimal) => (v == null ? 0 : Number(v));
    return {
      symbol: r.symbol,
      targetRole: r.targetRole,
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
