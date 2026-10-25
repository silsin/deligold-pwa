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

  // ── Tick history & moderation ────────────────────────────────────────────

  /** Paginated, filterable tick history — every recorded reading. */
  async listTicksHistory(opts: {
    symbol?: string;
    source?: string;
    from?: string;
    to?: string;
    limit?: string;
    offset?: string;
  }): Promise<{ rows: any[]; total: number }> {
    const where: Prisma.PriceTickWhereInput = {};
    if (opts.symbol) where.symbol = opts.symbol;
    if (opts.source) where.source = opts.source;
    if (opts.from || opts.to) {
      where.recordedAt = {};
      if (opts.from) where.recordedAt.gte = new Date(opts.from);
      if (opts.to) where.recordedAt.lte = new Date(opts.to);
    }
    const limit = Math.min(Number(opts.limit) || 100, 1000);
    const offset = Math.max(0, Number(opts.offset) || 0);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.priceTick.findMany({
        where,
        orderBy: { recordedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.priceTick.count({ where }),
    ]);

    return {
      rows: rows.map(r => ({
        id: r.id,
        symbol: r.symbol,
        source: r.source,
        price: Number(r.price),
        buy: r.buy == null ? null : Number(r.buy),
        sell: r.sell == null ? null : Number(r.sell),
        at: r.recordedAt instanceof Date ? r.recordedAt.getTime() : new Date(r.recordedAt as any).getTime(),
      })),
      total,
    };
  }

  /** Delete a single recorded tick (moderation). */
  async deleteTick(id: string) {
    await this.prisma.priceTick.delete({ where: { id } });
    return { ok: true };
  }

  /** Bulk-clear ticks by filter (e.g. purge a noisy source's history). */
  async clearTicks(opts: { symbol?: string; source?: string; before?: string }) {
    const where: Prisma.PriceTickWhereInput = {};
    if (opts.symbol) where.symbol = opts.symbol;
    if (opts.source) where.source = opts.source;
    if (opts.before) where.recordedAt = { lt: new Date(opts.before) };
    const { count } = await this.prisma.priceTick.deleteMany({ where });
    return { ok: true, count };
  }

  // ── Chart annotations (super-admin drawings) ─────────────────────────────

  async listAnnotations(symbol?: string) {
    const where = symbol ? { symbol } : {};
    return this.prisma.chartAnnotation.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });
  }

  async createAnnotation(actorId: string, data: {
    symbol: string;
    source?: string | null;
    kind: string;
    points: Array<{ x: number; y: number }>;
    color?: string | null;
    label?: string | null;
  }) {
    return this.prisma.chartAnnotation.create({
      data: {
        symbol: data.symbol,
        source: data.source ?? null,
        kind: data.kind,
        points: JSON.stringify(data.points ?? []),
        color: data.color ?? null,
        label: data.label ?? null,
        createdById: actorId,
      },
    });
  }

  async updateAnnotation(id: string, data: Partial<{
    points: Array<{ x: number; y: number }>;
    color: string | null;
    label: string | null;
  }>) {
    const update: Prisma.ChartAnnotationUpdateInput = {};
    if (data.points) update.points = JSON.stringify(data.points);
    if (data.color !== undefined) update.color = data.color;
    if (data.label !== undefined) update.label = data.label;
    return this.prisma.chartAnnotation.update({ where: { id }, data: update });
  }

  async deleteAnnotation(id: string) {
    await this.prisma.chartAnnotation.delete({ where: { id } });
    return { ok: true };
  }
}
