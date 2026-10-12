import { Injectable } from '@nestjs/common';
import { MovementDirection, Role, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountsService, ACCOUNTS } from '../accounting/accounts.service';
import { LedgerService } from '../accounting/ledger.service';
import { isTradeSymbol } from '../market/symbols';
import { TradeError } from '../common/errors';
import { dec, grams as roundGrams, money } from '../common/money';

export interface StoreView {
  id: string;
  name: string;
  address: string | null;
  active: boolean;
  holdings: Array<{ symbol: string; grams: number; avgCost: number; marketValue: number }>;
  createdAt: Date;
}

/** A broker id matching nothing, so an unscoped staff account gets an empty list. */
const NO_BROKER = '__no_broker__';

/**
 * The manual gold shops.
 *
 * Each store is a vault: gold physically sits there, measured in grams per
 * symbol. Every gram that enters or leaves is recorded as a StoreMovement *and*
 * posted to the double-entry ledger, so the vault and the books can never
 * silently drift apart.
 */
@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
    private readonly ledger: LedgerService,
  ) {}

  /** Every store visible to the caller, with its current vault contents. */
  async list(actor: { role: Role; brokerId: string | null }): Promise<StoreView[]> {
    const stores = await this.prisma.store.findMany({
      where:
        actor.role === Role.SUPER_ADMIN
          ? {}
          : { brokerId: actor.brokerId ?? NO_BROKER },
      include: { holdings: true },
      orderBy: { createdAt: 'asc' },
    });
    return stores.map(s => this.storeView(s));
  }

  /**
   * Opens a new storefront under the caller's broker.
   *
   * A BROKER_ADMIN creates shops inside their own organisation; a SUPER_ADMIN
   * may open one anywhere by naming the broker explicitly.
   */
  async create(
    actor: { userId: string; role: Role; brokerId: string | null },
    input: { name: string; address?: string; brokerId?: string },
  ): Promise<StoreView> {
    const name = (input.name ?? '').trim();
    if (!name) throw new TradeError('نام فروشگاه الزامی است');

    const brokerId =
      actor.role === Role.SUPER_ADMIN ? (input.brokerId ?? null) : actor.brokerId;
    if (!brokerId) throw new TradeError('سازمان مشخص نیست');

    const store = await this.prisma.store.create({
      data: { name, address: input.address?.trim() || null, brokerId },
      include: { holdings: true },
    });
    return this.storeView(store);
  }

  /**
   * Moves gold into or out of a vault.
   *
   * IN is a supplier delivery or a counted surplus; OUT is a customer hand-over
   * or a transfer to the trading pool.
   */
  async move(
    actor: { userId: string; role: Role; brokerId: string | null },
    storeId: string,
    input: { symbol: string; direction: MovementDirection; grams: number; price?: number; reason?: string },
  ): Promise<StoreView> {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: { holdings: true },
    });
    if (!store) throw new TradeError('فروشگاه یافت نشد', 404);
    if (actor.role !== Role.SUPER_ADMIN && store.brokerId !== (actor.brokerId ?? NO_BROKER)) {
      throw new TradeError('این فروشگاه متعلق به سازمان شما نیست', 403);
    }
    if (store.active === false) throw new TradeError('این فروشگاه غیرفعال است');

    const symbol = (input.symbol ?? '').trim();
    if (!isTradeSymbol(symbol)) throw new TradeError('نماد معاملاتی نامعتبر است');

    const weight = Number(input.grams);
    if (!Number.isFinite(weight) || weight <= 0) throw new TradeError('وزن نامعتبر است');
    if (weight > 100_000) throw new TradeError('حداکثر وزن هر حرکت ۱۰۰٬۰۰۰ گرم است');

    const unitPrice = input.price === undefined ? 0 : money(Number(input.price));
    if (input.price !== undefined && (!Number.isFinite(unitPrice) || unitPrice < 0)) {
      throw new TradeError('قیمت هر گرم نامعتبر است');
    }

    await this.prisma.$transaction(async tx => {
      const holding = await tx.storeHolding.findUnique({
        where: { storeId_symbol: { storeId, symbol } },
      });
      const held = dec(holding?.grams);

      if (input.direction === 'IN') {
        const total = roundGrams(held + weight);
        const avg =
          total > 0
            ? (held * dec(holding?.avgCost) + weight * unitPrice) / total
            : unitPrice;
        await tx.storeHolding.upsert({
          where: { storeId_symbol: { storeId, symbol } },
          create: { storeId, symbol, grams: total, avgCost: avg },
          update: { grams: total, avgCost: avg },
        });
      } else {
        if (held + 1e-9 < weight) {
          throw new TradeError(`موجودی ${symbol} در این فروشگاه کافی نیست`);
        }
        const left = roundGrams(held - weight);
        if (left <= 1e-9 && holding) {
          await tx.storeHolding.delete({ where: { id: holding.id } });
        } else if (holding) {
          await tx.storeHolding.update({
            where: { id: holding.id },
            data: { grams: left },
          });
        }
      }

      await tx.storeMovement.create({
        data: {
          storeId,
          symbol,
          direction: input.direction,
          grams: new Prisma.Decimal(weight.toFixed(6)),
          price: input.price === undefined ? null : new Prisma.Decimal(String(unitPrice)),
          reason: input.reason?.trim() || null,
          createdById: actor.userId,
        },
      });
    });

    const fresh = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: { holdings: true },
    });
    return this.storeView(fresh!);
  }

  /** Movement history for one store, newest first. */
  async movements(
    actor: { role: Role; brokerId: string | null },
    storeId: string,
  ) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new TradeError('فروشگاه یافت نشد', 404);
    if (actor.role !== Role.SUPER_ADMIN && store.brokerId !== (actor.brokerId ?? NO_BROKER)) {
      throw new TradeError('این فروشگاه متعلق به سازمان شما نیست', 403);
    }
    return this.prisma.storeMovement.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }

  private storeView(s: {
    id: string; name: string; address: string | null; active: boolean;
    holdings: Array<{ symbol: string; grams: unknown; avgCost: unknown }>;
    createdAt: Date;
  }): StoreView {
    return {
      id: s.id,
      name: s.name,
      address: s.address,
      active: s.active,
      holdings: s.holdings.map(h => ({
        symbol: h.symbol,
        grams: roundGrams(dec(h.grams)),
        avgCost: money(dec(h.avgCost)),
        marketValue: money(roundGrams(dec(h.grams)) * dec(h.avgCost)),
      })),
      createdAt: s.createdAt,
    };
  }
}

