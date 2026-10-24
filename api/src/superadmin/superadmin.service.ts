import { Injectable } from '@nestjs/common';
import { OrderStatus, OrderSide, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MarketService } from '../market/market.service';
import { TradeError } from '../common/errors';
import { isTradeSymbol } from '../market/symbols';
import { SOURCE_KINDS } from './dto/superadmin.dto';

/** One trade row flattened for the super-admin explorer. */
export interface TradeView {
  id: string;
  ref: string;
  symbol: string;
  side: OrderSide;
  kind: string;
  grams: number;
  price: number;
  amount: number;
  fee: number;
  pnl: number | null;
  status: OrderStatus;
  createdAt: Date;
  userId: string;
  userName: string;
  userPhone: string;
  brokerId: string | null;
  brokerName: string;
}

/** One broker option for the trade filter dropdown. */
export interface BrokerOption {
  id: string;
  name: string;
}

/**
 * Super-admin only: manages price sources and reads the whole platform's trade
 * flow. Source writes drop the market service's source cache so the board and
 * the tick recorder pick up the change immediately.
 */
@Injectable()
export class SuperadminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly market: MarketService,
  ) {}

  // ── Price sources ────────────────────────────────────────────────────────

  /** Every source with live health (see MarketService.listSources). */
  listSources() {
    return this.market.listSources();
  }

  /** Price-tick history for the live chart. */
  ticks(opts: { symbol?: string; source?: string; range?: string }) {
    return this.market.getTicks(opts);
  }

  /**
   * Create a source. Only `manual` and `trades` kinds are creatable here — the
   * built-in HTTP sources (akbari/tgju/estjt) are seeded and managed via update.
   */
  async createSource(dto: {
    name: string;
    kind: string;
    enabled?: boolean;
    priority?: number;
    config?: Record<string, unknown>;
    note?: string;
  }) {
    const kind = dto.kind?.trim();
    if (!SOURCE_KINDS.includes(kind as any)) {
      throw new TradeError('نوع منبع قیمت نامعتبر است', 400);
    }
    if (kind === 'akbari' || kind === 'tgju' || kind === 'estjt') {
      throw new TradeError('منابع داخلی فقط از طریق تنظیمات قابل مدیریت هستند', 400);
    }
    const name = dto.name.trim();
    if (!name) throw new TradeError('نام منبع الزامی است', 400);

    const existing = await this.prisma.priceSource.findUnique({ where: { name } });
    if (existing) throw new TradeError('منبعی با این نام وجود دارد', 400);

    const row = await this.prisma.priceSource.create({
      data: {
        name,
        kind,
        enabled: dto.enabled ?? true,
        priority: dto.priority ?? 100,
        config: dto.config ? JSON.stringify(dto.config) : '{}',
        note: dto.note ?? null,
        isSystem: false,
      },
    });
    this.market.invalidateSources();
    return row;
  }

  /** Update a source's mutable fields. Config is replaced wholesale when given. */
  async updateSource(
    id: string,
    dto: {
      name?: string;
      enabled?: boolean;
      priority?: number;
      config?: Record<string, unknown>;
      note?: string;
    },
  ) {
    const row = await this.prisma.priceSource.findUnique({ where: { id } });
    if (!row) throw new TradeError('منبع قیمت یافت نشد', 404);

    const data: Prisma.PriceSourceUpdateInput = {};
    if (dto.name != null) {
      const name = dto.name.trim();
      if (!name) throw new TradeError('نام منبع الزامی است', 400);
      const clash = await this.prisma.priceSource.findUnique({ where: { name } });
      if (clash && clash.id !== id) throw new TradeError('منبعی با این نام وجود دارد', 400);
      data.name = name;
    }
    if (dto.enabled != null) data.enabled = dto.enabled;
    if (dto.priority != null) data.priority = dto.priority;
    if (dto.config != null) data.config = JSON.stringify(dto.config);
    if (dto.note != null) data.note = dto.note.trim() || null;

    const updated = await this.prisma.priceSource.update({ where: { id }, data });
    this.market.invalidateSources();
    return updated;
  }

  /** Delete a source. Built-in (isSystem) sources cannot be deleted. */
  async deleteSource(id: string) {
    const row = await this.prisma.priceSource.findUnique({ where: { id } });
    if (!row) throw new TradeError('منبع قیمت یافت نشد', 404);
    if (row.isSystem) throw new TradeError('منابع داخلی قابل حذف نیستند', 400);

    await this.prisma.priceSource.delete({ where: { id } });
    this.market.invalidateSources();
    return { ok: true };
  }

  /** Set the priority of many sources at once (the admin reorders the chain). */
  async reorder(items: { id: string; priority: number }[]) {
    await this.prisma.$transaction(
      items.map(it =>
        this.prisma.priceSource.update({
          where: { id: it.id },
          data: { priority: it.priority },
        }),
      ),
    );
    this.market.invalidateSources();
    return this.market.listSources();
  }

  // ── All trades ───────────────────────────────────────────────────────────

  /**
   * Every filled/pending order across all users and brokers, filterable. A
   * super admin sees the whole platform — no broker scoping.
   */
  async listTrades(opts: {
    symbol?: string;
    side?: string;
    status?: string;
    brokerId?: string;
    userId?: string;
    from?: string;
    to?: string;
    limit?: string;
  }): Promise<TradeView[]> {
    const where: Prisma.OrderWhereInput = {};
    if (opts.symbol && isTradeSymbol(opts.symbol)) where.symbol = opts.symbol;
    if (opts.side && (opts.side === 'BUY' || opts.side === 'SELL')) where.side = opts.side;
    if (opts.status && opts.status in OrderStatus) where.status = opts.status as OrderStatus;
    if (opts.userId) where.userId = opts.userId;
    if (opts.brokerId) where.user = { brokerId: opts.brokerId };

    const created: Prisma.DateTimeFilter = {};
    if (opts.from) created.gte = new Date(opts.from);
    if (opts.to) created.lte = new Date(opts.to);
    if (created.gte || created.lte) where.createdAt = created;

    const limit = Math.min(Number(opts.limit) || 200, 2000);

    const rows = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            brokerId: true,
            broker: { select: { name: true } },
          },
        },
      },
    });

    return rows.map(r => ({
      id: r.id,
      ref: r.ref,
      symbol: r.symbol,
      side: r.side,
      kind: r.kind,
      grams: Number(r.grams),
      price: Number(r.price),
      amount: Number(r.amount),
      fee: Number(r.fee),
      pnl: r.pnl == null ? null : Number(r.pnl),
      status: r.status,
      createdAt: r.createdAt,
      userId: r.userId,
      userName: r.user?.name ?? '',
      userPhone: r.user?.phone ?? '',
      brokerId: r.user?.brokerId ?? null,
      brokerName: r.user?.broker?.name ?? '',
    }));
  }

  /** Every broker, for the trade filter dropdown. */
  async listBrokers(): Promise<BrokerOption[]> {
    return this.prisma.broker.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
}
