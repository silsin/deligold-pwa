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
  description: string | null;
  phone: string | null;
  logoPath: string | null;
  holdings: Array<{ symbol: string; grams: number; avgCost: number; marketValue: number }>;
  createdAt: Date;
}

export interface StoreProductView {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  unit: string | null;
  active: boolean;
  sortId: number;
}

export interface StorePublicView {
  id: string;
  name: string;
  description: string | null;
  phone: string | null;
  address: string | null;
  logoPath: string | null;
  products: StoreProductView[];
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

  /** Update store details (name, description, phone, address). */
  async updateStore(
    actor: { role: Role; brokerId: string | null },
    storeId: string,
    dto: { name?: string; description?: string; phone?: string; address?: string },
  ): Promise<StoreView> {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: { holdings: true },
    });
    if (!store) throw new TradeError('فروشگاه یافت نشد', 404);
    if (actor.role !== Role.SUPER_ADMIN && store.brokerId !== (actor.brokerId ?? NO_BROKER)) {
      throw new TradeError('این فروشگاه متعلق به سازمان شما نیست', 403);
    }

    const data: Prisma.StoreUpdateInput = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new TradeError('نام فروشگاه الزامی است');
      data.name = name;
    }
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.phone !== undefined) data.phone = dto.phone?.trim() || null;
    if (dto.address !== undefined) data.address = dto.address?.trim() || null;

    const updated = await this.prisma.store.update({
      where: { id: storeId },
      data,
      include: { holdings: true },
    });
    return this.storeView(updated);
  }

  /** Store the relative logo path returned from multer. */
  async updateLogo(
    actor: { role: Role; brokerId: string | null },
    storeId: string,
    relativePath: string,
  ): Promise<StoreView> {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: { holdings: true },
    });
    if (!store) throw new TradeError('فروشگاه یافت نشد', 404);
    if (actor.role !== Role.SUPER_ADMIN && store.brokerId !== (actor.brokerId ?? NO_BROKER)) {
      throw new TradeError('این فروشگاه متعلق به سازمان شما نیست', 403);
    }

    const updated = await this.prisma.store.update({
      where: { id: storeId },
      data: { logoPath: relativePath },
      include: { holdings: true },
    });
    return this.storeView(updated);
  }

  /** Public view: active stores for a broker, each with their active products. */
  async getPublicStores(brokerId: string): Promise<StorePublicView[]> {
    const stores = await this.prisma.store.findMany({
      where: { brokerId, active: true },
      include: {
        products: {
          where: { active: true },
          orderBy: [{ sortId: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return stores.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      phone: s.phone,
      address: s.address,
      logoPath: s.logoPath,
      products: s.products.map(p => this.productView(p)),
    }));
  }

  /** All products for a store — staff/same-broker only. */
  async listProducts(
    actor: { role: Role; brokerId: string | null },
    storeId: string,
  ): Promise<StoreProductView[]> {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new TradeError('فروشگاه یافت نشد', 404);
    if (actor.role !== Role.SUPER_ADMIN && store.brokerId !== (actor.brokerId ?? NO_BROKER)) {
      throw new TradeError('این فروشگاه متعلق به سازمان شما نیست', 403);
    }

    const products = await this.prisma.storeProduct.findMany({
      where: { storeId },
      orderBy: [{ sortId: 'asc' }, { createdAt: 'asc' }],
    });
    return products.map(p => this.productView(p));
  }

  /** Create a new product in a store. */
  async createProduct(
    actor: { role: Role; brokerId: string | null },
    storeId: string,
    dto: { name: string; description?: string; price?: number; unit?: string; active?: boolean; sortId?: number },
  ): Promise<StoreProductView> {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new TradeError('فروشگاه یافت نشد', 404);
    if (actor.role !== Role.SUPER_ADMIN && store.brokerId !== (actor.brokerId ?? NO_BROKER)) {
      throw new TradeError('این فروشگاه متعلق به سازمان شما نیست', 403);
    }

    const name = (dto.name ?? '').trim();
    if (!name) throw new TradeError('نام محصول الزامی است');

    const product = await this.prisma.storeProduct.create({
      data: {
        storeId,
        name,
        description: dto.description?.trim() || null,
        price: dto.price !== undefined ? new Prisma.Decimal(String(dto.price)) : null,
        unit: dto.unit?.trim() || null,
        active: dto.active ?? true,
        sortId: dto.sortId ?? 0,
      },
    });
    return this.productView(product);
  }

  /** Update an existing product. */
  async updateProduct(
    actor: { role: Role; brokerId: string | null },
    storeId: string,
    productId: string,
    dto: { name?: string; description?: string; price?: number; unit?: string; active?: boolean; sortId?: number },
  ): Promise<StoreProductView> {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new TradeError('فروشگاه یافت نشد', 404);
    if (actor.role !== Role.SUPER_ADMIN && store.brokerId !== (actor.brokerId ?? NO_BROKER)) {
      throw new TradeError('این فروشگاه متعلق به سازمان شما نیست', 403);
    }

    const existing = await this.prisma.storeProduct.findUnique({ where: { id: productId } });
    if (!existing || existing.storeId !== storeId) {
      throw new TradeError('محصول یافت نشد', 404);
    }

    const data: Prisma.StoreProductUpdateInput = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new TradeError('نام محصول الزامی است');
      data.name = name;
    }
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.price !== undefined) data.price = new Prisma.Decimal(String(dto.price));
    if (dto.unit !== undefined) data.unit = dto.unit?.trim() || null;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.sortId !== undefined) data.sortId = dto.sortId;

    const updated = await this.prisma.storeProduct.update({
      where: { id: productId },
      data,
    });
    return this.productView(updated);
  }

  /** Delete a product. */
  async deleteProduct(
    actor: { role: Role; brokerId: string | null },
    storeId: string,
    productId: string,
  ): Promise<{ ok: boolean }> {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new TradeError('فروشگاه یافت نشد', 404);
    if (actor.role !== Role.SUPER_ADMIN && store.brokerId !== (actor.brokerId ?? NO_BROKER)) {
      throw new TradeError('این فروشگاه متعلق به سازمان شما نیست', 403);
    }

    const existing = await this.prisma.storeProduct.findUnique({ where: { id: productId } });
    if (!existing || existing.storeId !== storeId) {
      throw new TradeError('محصول یافت نشد', 404);
    }

    await this.prisma.storeProduct.delete({ where: { id: productId } });
    return { ok: true };
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
    description?: string | null; phone?: string | null; logoPath?: string | null;
    holdings: Array<{ symbol: string; grams: unknown; avgCost: unknown }>;
    createdAt: Date;
  }): StoreView {
    return {
      id: s.id,
      name: s.name,
      address: s.address,
      active: s.active,
      description: s.description ?? null,
      phone: s.phone ?? null,
      logoPath: s.logoPath ?? null,
      holdings: s.holdings.map(h => ({
        symbol: h.symbol,
        grams: roundGrams(dec(h.grams)),
        avgCost: money(dec(h.avgCost)),
        marketValue: money(roundGrams(dec(h.grams)) * dec(h.avgCost)),
      })),
      createdAt: s.createdAt,
    };
  }

  private productView(p: {
    id: string; name: string; description: string | null;
    price: unknown; unit: string | null; active: boolean; sortId: number;
  }): StoreProductView {
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price !== null && p.price !== undefined ? dec(p.price) : null,
      unit: p.unit,
      active: p.active,
      sortId: p.sortId,
    };
  }
}
