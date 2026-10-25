import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BoardPrice, BrokerPriceRule, PriceSource, PriceTick, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TradeError } from '../common/errors';
import { TRADE_SYMBOLS, isTradeSymbol } from './symbols';
import {
  SYMBOL_TO_ALL_IDS,
  akbariConfig,
  akbariConfigured,
  akbariTwoSided,
  fetchAkbariBoard,
  type UpstreamBoard,
} from './akbari';
import { RATE_KEY_TO_SYMBOL, synthesizeSpread } from './public-rates';
import { fetchEstjtBoard } from './estjt';
import { fetchTgjuBoard } from './tgju';

/**
 * The live price board.
 *
 * The API is the single place that reads an upstream quote, so the number a
 * customer sees, the number an order fills at and the number a report values a
 * position at are all the same reading. A client-supplied price is never
 * trusted — that is the whole reason pricing lives here rather than in the
 * order handler.
 *
 * Quotes are cached briefly: the board is polled by every open client, and a
 * public data source will rate-limit (or ban) a service that re-fetches per
 * request.
 */
export interface Quote {
  symbol: string;
  /** Mid/base price in Toman — what the board displays. */
  price: number;
  /** What the shop BUYS at (a customer selling). Null when the source has no spread. */
  buy: number | null;
  /** What the shop SELLS at (a customer buying). Null when the source has no spread. */
  sell: number | null;
  /** True when a manager set this price manually (overrides the feed). */
  manual?: boolean;
  /** False when the customer's broker has closed customer buying of this symbol. */
  canBuy?: boolean;
  /** False when the customer's broker has closed customer selling of this symbol. */
  canSell?: boolean;
}

export interface Board {
  quotes: Record<string, Quote>;
  /** Which source fed the board, by name. */
  source: string;
  updatedAt: number;
  /** True when the last fetch failed and we are serving a cached/fallback board. */
  stale: boolean;
  /** Human-readable note shown on the board, e.g. "some rates filled from backup". */
  note?: string;
  /** Symbols not obtained fresh from a live source (filled from memo/snapshot/fallback). */
  staleRates?: string[];
}

/**
 * A manager's manual override, flattened for the client. Prisma `Decimal` fields
 * are converted to plain numbers so the PWA never has to parse a decimal string.
 */
export interface BoardPriceView {
  symbol: string;
  price: number | null;
  buy: number | null;
  sell: number | null;
  enabled: boolean;
  allowBuy: boolean;
  allowSell: boolean;
  updatedAt: Date;
}

/** One source row flattened for the super-admin UI, with live health. */
export interface SourceView {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  priority: number;
  isSystem: boolean;
  note: string;
  /** Parsed config with any secret-looking keys stripped. */
  config: Record<string, unknown>;
  /** Whether the service has a recent cached reading for this source. */
  health: { fresh: boolean; updatedAt: number | null };
  updatedAt: Date;
}

/** One price-tick reading, flattened for the super-admin live chart. */
export interface PriceTickView {
  symbol: string;
  source: string;
  price: number;
  buy: number | null;
  sell: number | null;
  /** Epoch ms — the chart's X axis. */
  at: number;
}

/** How long a fetched board is served before the next request re-fetches it. */
const CACHE_TTL_MS = 60_000;

/**
 * After a partially-fresh fetch, hold off re-polling for this long so a slow
 * upstream is not hammered on every request. A total failure is NOT held — the
 * next request should retry in case the upstream recovered.
 */
const STALE_HOLD_MS = 3 * 60_000;

/** Background warm-up tick. Keeps the cache fresh even with no clients polling. */
const POLL_INTERVAL_MS = 5 * 60_000;

/** How often the recorder samples every enabled source and writes price ticks. */
const RECORD_INTERVAL_MS = 20_000;

/** How often old price ticks are pruned. */
const PRUNE_INTERVAL_MS = 6 * 60 * 60_000;

/** Price ticks older than this are deleted. */
const TICK_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** A source adapter's result: the quotes it could produce, and when. */
interface SourceResult {
  quotes: Record<string, Quote>;
  updatedAt: number;
}

/**
 * Used when every upstream is unreachable and nothing is cached yet, so the
 * app still boots and the board still renders. Values are deliberately
 * plausible, and `stale: true` tells the UI to say so.
 */
const FALLBACK_PRICES: Record<string, number> = {
  GOLD18: 26_000_000,
  COIN_NEW: 266_000_000,
  COIN_OLD: 258_000_000,
  COIN_HALF: 140_000_000,
  COIN_QUARTER: 75_000_000,
};

/** The built-in sources seeded on first boot, ordered by default priority. */
const DEFAULT_SOURCES = [
  { name: 'akbari', kind: 'akbari', priority: 10, isSystem: true, enabled: true },
  { name: 'tgju', kind: 'tgju', priority: 20, isSystem: true, enabled: true },
  { name: 'estjt', kind: 'estjt', priority: 30, isSystem: true, enabled: true },
  { name: 'trades', kind: 'trades', priority: 40, isSystem: true, enabled: true },
];

@Injectable()
export class MarketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketService.name);

  private cache: Board | null = null;
  private inflight: Promise<Board> | null = null;
  /** Last fully-fresh board, kept so a later outage serves real prices, not the canned ones. */
  private lastSnapshot: Board | null = null;
  /** Until this time, serve the cached board even past TTL (partial-fetch throttle). */
  private staleHoldUntil = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private recordTimer: ReturnType<typeof setInterval> | null = null;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;

  /** Per-source adapter cache: name → { quotes, updatedAt }. Protects upstreams
   *  from being re-fetched more than once per CACHE_TTL. */
  private sourceCache = new Map<string, SourceResult>();
  /** Last written tick per source|symbol, to skip identical flat ticks. */
  private lastTickSeen = new Map<string, { price: number; at: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    // Warm the cache at boot so the first customer read is instant, then keep
    // it warm on a 5-minute tick — a public union server can take 30+ s, and no
    // customer should wait on that for a board refresh.
    void this.board().catch(err => this.logger.warn(`initial board warm-up failed: ${String(err)}`));
    this.pollTimer = setInterval(() => void this.board().catch(() => {}), POLL_INTERVAL_MS);
    // Start recording price ticks for the super-admin live chart immediately and
    // on a short cadence so the chart has a live feel without hammering upstreams
    // (each source is only re-fetched at most once per CACHE_TTL_MS).
    void this.recordAllSources().catch(err => this.logger.warn(`initial tick record failed: ${String(err)}`));
    this.recordTimer = setInterval(() => void this.recordAllSources().catch(() => {}), RECORD_INTERVAL_MS);
    this.pruneTimer = setInterval(() => void this.pruneTicks().catch(() => {}), PRUNE_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.recordTimer) clearInterval(this.recordTimer);
    if (this.pruneTimer) clearInterval(this.pruneTimer);
  }

  /**
   * The current board, fetching a fresh one when the cache has expired.
   *
   * Concurrent callers share one in-flight fetch rather than each triggering
   * their own — the board is polled by every connected client, so without this
   * a single tick would fan out into dozens of upstream requests.
   */
  async board(): Promise<Board> {
    if (this.cache) {
      const age = Date.now() - this.cache.updatedAt;
      if (age < CACHE_TTL_MS) return this.cache;
      // Stale hold: keep serving the cached board rather than re-polling a slow
      // upstream that just returned partial data.
      if (Date.now() < this.staleHoldUntil) return this.cache;
    }
    if (this.inflight) return this.inflight;

    this.inflight = this.fetchBoard()
      .catch((err: unknown): Board => {
        this.logger.warn(
          `price fetch failed, serving ${this.cache ? 'cached' : 'fallback'} board: ${String(err)}`,
        );
        return this.cache ?? this.fallbackBoard();
      })
      .then(async board => {
        const merged = await this.applyOverrides(board);
        this.cache = merged;
        return merged;
      })
      .finally(() => {
        this.inflight = null;
      });

    return this.inflight;
  }

  /**
   * Drop the cached board so the next `board()` re-reads the feed *and* the
   * manager overrides. Called whenever a broker manager saves or clears a price,
   * so a manual change is visible on the customer board immediately rather than
   * after the cache TTL.
   */
  invalidate(): void {
    this.cache = null;
  }

  /**
   * Drop the per-source adapter cache and the merged board. Called by the
   * super-admin service after a source is created/updated/deleted/reordered so
   * the change reaches the board (and the recorder) at once.
   */
  invalidateSources(): void {
    this.sourceCache.clear();
    this.invalidate();
  }

  /**
   * The board with one broker's pricing rules layered on top.
   *
   * Reads the live board (feed + manual overrides) then, for every symbol the
   * broker has an enabled rule for, recomputes the buy/sell from the raw `price`
   * plus the broker's margin — so two brokers can quote different spreads off
   * the same market price. Symbols with no rule keep the feed's own buy/sell.
   *
   * The rules are read straight from Prisma (not via BrokerPricingService) so
   * MarketService never depends on the pricing module — keeps the dependency
   * one-way and avoids a constructor cycle.
   */
  async boardForBroker(brokerId: string): Promise<Board> {
    // Serve the cached board rather than wait on a slow upstream (8+ s), but
    // kick a refresh when it has gone stale: every signed-in customer reads
    // this route, so without the kick nothing but the 5-minute poll would
    // ever refresh their prices.
    if (this.cache && Date.now() - this.cache.updatedAt >= CACHE_TTL_MS && !this.inflight) {
      void this.board().catch(() => {});
    }
    const board = this.cache ?? (await this.board());

    let rules: BrokerPriceRule[];
    try {
      rules = await this.prisma.brokerPriceRule.findMany({ where: { brokerId, enabled: true } });
    } catch (err) {
      this.logger.warn(`could not read broker pricing rules, serving raw board: ${String(err)}`);
      return board;
    }
    if (!rules.length) return board;

    const quotes: Record<string, Quote> = { ...board.quotes };
    for (const rule of rules) {
      const quote = quotes[rule.symbol];
      if (!quote) continue;

      const rawPrice = quote.price;
      const buyToman = Number(rule.buyMarginToman) || 0;
      const sellToman = Number(rule.sellMarginToman) || 0;
      const buyPct = Number(rule.buyMarginPercent) || 0;
      const sellPct = Number(rule.sellMarginPercent) || 0;

      // The rule's "buy"/"sell" margins are from the CUSTOMER's side (the
      // manager's form previews them as قیمت خرید/فروش مشتری). Quote fields are
      // from the SHOP's side, so they cross over: what a customer pays to buy
      // is what the shop sells at (`sell`), and vice versa. `fillPrice` reads
      // the same fields, so the number shown is the number an order fills at.
      const customerBuys = rawPrice + buyToman + Math.round((rawPrice * buyPct) / 100);
      const customerSells = rawPrice - sellToman - Math.round((rawPrice * sellPct) / 100);
      const noMargin = buyToman === 0 && sellToman === 0 && buyPct === 0 && sellPct === 0;

      quotes[rule.symbol] = {
        ...quote,
        // No margin at all → no spread; both sides trade at the mid.
        sell: noMargin ? quote.sell : customerBuys,
        buy: noMargin ? quote.buy : Math.max(0, customerSells),
        canBuy: rule.allowBuy,
        canSell: rule.allowSell,
      };
    }

    return { ...board, quotes };
  }

  /** Price for one symbol, or null when the board does not carry it. */
  async priceOf(symbol: string): Promise<number | null> {
    const board = await this.board();
    return board.quotes[symbol]?.price ?? null;
  }

  /**
   * The price an order fills at.
   *
   * A customer BUYING pays the shop's ask (`sell`), and a customer SELLING
   * receives the shop's bid (`buy`) — the same two-sided quoting the physical
   * shops use. When a source carries no spread we synthesise one from the mid,
   * so the platform never fills both sides at the same number.
   */
  async fillPrice(symbol: string, side: 'BUY' | 'SELL', brokerId?: string | null): Promise<number | null> {
    if (!isTradeSymbol(symbol)) return null;
    // A broker's customer trades at that broker's numbers — the same board
    // their app displays — never the raw feed.
    if (brokerId) await this.board(); // fresh reading first; boardForBroker serves the cache
    const board = brokerId ? await this.boardForBroker(brokerId) : await this.board();
    const quote = board.quotes[symbol];
    if (!quote) return null;

    if (side === 'BUY' && quote.canBuy === false) {
      throw new TradeError('خرید این نماد در حال حاضر توسط کارگزاری بسته است');
    }
    if (side === 'SELL' && quote.canSell === false) {
      throw new TradeError('فروش این نماد در حال حاضر توسط کارگزاری بسته است');
    }

    if (side === 'BUY') return quote.sell ?? quote.price;
    return quote.buy ?? quote.price;
  }

  /**
   * Builds the board by walking the enabled source registry in priority order.
   *
   * Each enabled source runs through its adapter; the first source (by
   * priority) to provide a symbol wins, and the rest gap-fill whatever is
   * missing — so a single outage never blanks the board. When every live source
   * is unreachable the last fresh snapshot is used, then the canned fallback.
   * Each step is best-effort: a slow or dead source is skipped and the next
   * fills the gaps.
   *
   * The sources are DB rows (`PriceSource`); built-in code fetchers stay in
   * code and are driven by those rows. Adapters share a per-source cache so the
   * board fetch and the tick recorder never re-fetch a source more than once
   * per `CACHE_TTL_MS`.
   */
  private async fetchBoard(): Promise<Board> {
    const sources = await this.loadSources();
    const quotes: Record<string, Quote> = {};
    const freshSymbols = new Set<string>();
    const staleRateKeys: string[] = [];
    let primarySource = '';
    let updatedAt = Date.now();

    const missing = () => TRADE_SYMBOLS.some(s => !quotes[s.symbol]);

    for (const src of sources) {
      const qs = await this.getSourceQuotes(src);
      if (!qs) continue;
      for (const symbol of Object.keys(qs)) {
        if (quotes[symbol]) continue; // first source wins
        const q = qs[symbol];
        if (!q || !Number.isFinite(q.price) || q.price <= 0) continue;
        quotes[symbol] = q;
        freshSymbols.add(symbol);
        if (!primarySource) primarySource = src.name;
      }
    }
    // Use the winning source's timestamp so the board reports when its data
    // was actually read, not "now".
    if (primarySource) {
      const hit = this.sourceCache.get(primarySource);
      if (hit) updatedAt = hit.updatedAt;
    }

    // Last fresh snapshot — an old real price beats a canned one.
    if (missing() && this.lastSnapshot) {
      for (const { symbol } of TRADE_SYMBOLS) {
        if (quotes[symbol] || !this.lastSnapshot.quotes[symbol]) continue;
        quotes[symbol] = this.lastSnapshot.quotes[symbol];
        staleRateKeys.push(symbol);
      }
    }

    // Canned fallback — the board still renders when everything else failed.
    this.fillFallback(quotes, staleRateKeys);

    const source = primarySource || 'fallback';
    const stale = freshSymbols.size === 0;

    // Partial fresh data throttles re-polling; a total failure does not.
    if (freshSymbols.size > 0 && freshSymbols.size < TRADE_SYMBOLS.length) {
      this.staleHoldUntil = Date.now() + STALE_HOLD_MS;
    }

    // Keep the snapshot fresh so a later outage falls back to real prices.
    if (freshSymbols.size > 0) {
      this.lastSnapshot = { quotes: { ...quotes }, source, updatedAt, stale };
    }

    if (source === 'fallback' && !akbariConfigured(akbariConfig())) {
      this.logger.error(
        'All price sources failed and Akbari is not configured (MARKET_UID / MARKET_TOKEN). ' +
          'The board is serving indicative fallback values.',
      );
    }

    return { quotes, source, updatedAt, stale, note: this.buildNote(stale, staleRateKeys), staleRates: staleRateKeys };
  }

  /**
   * Builds quotes from the Akbari upstream's row map.
   *
   * For each symbol, tries every upstream id in priority order and uses the
   * first active one. This lets a fallback id (e.g. id 1 for GOLD18) take over
   * automatically when the primary row (id 501) is inactive — no manual change.
   */
  private mapUpstream(upstream: UpstreamBoard): Record<string, Quote> {
    const quotes: Record<string, Quote> = {};

    for (const { symbol } of TRADE_SYMBOLS) {
      const ids = SYMBOL_TO_ALL_IDS[symbol];
      if (!ids?.length) continue;

      for (const id of ids) {
        const row = upstream.rows.get(id);
        if (!row) continue;
        const twoSided = akbariTwoSided(row);
        if (!twoSided) continue; // inactive or invalid — try next id
        quotes[symbol] = { symbol, price: twoSided.price, buy: twoSided.buy, sell: twoSided.sell };
        break; // first active id wins
      }
    }

    return quotes;
  }

  /** Fills any still-missing symbols with the canned indicative prices. */
  private fillFallback(quotes: Record<string, Quote>, staleRateKeys: string[]): void {
    for (const { symbol } of TRADE_SYMBOLS) {
      if (quotes[symbol]) continue;
      const price = FALLBACK_PRICES[symbol];
      if (!price) continue;
      quotes[symbol] = { symbol, price, buy: null, sell: null };
      staleRateKeys.push(symbol);
    }
  }

  private fallbackBoard(): Board {
    const quotes: Record<string, Quote> = {};
    const staleRateKeys: string[] = [];
    this.fillFallback(quotes, staleRateKeys);
    return {
      quotes,
      source: 'fallback',
      updatedAt: Date.now(),
      stale: true,
      note: 'دریافت قیمت زنده ناموفق بود؛ قیمت‌های پشتیبان نمایش داده می‌شود.',
      staleRates: staleRateKeys,
    };
  }

  /** A short Persian note for the board, only when something is worth saying. */
  private buildNote(stale: boolean, staleRateKeys: string[]): string {
    if (stale) {
      return 'دریافت قیمت زنده ناموفق بود؛ قیمت‌های پشتیبان نمایش داده می‌شود.';
    }
    if (staleRateKeys.length > 0) {
      return 'برخی نمادها از منبع پشتیبان تکمیل شدند.';
    }
    return '';
  }

  // ── Source registry & adapters ──────────────────────────────────────────

  /** Parse a source's JSON config safely into an object. */
  private parseConfig(config: string | null | undefined): Record<string, any> {
    if (!config) return {};
    try {
      return JSON.parse(config) as Record<string, any>;
    } catch {
      return {};
    }
  }

  /**
   * Every enabled source in priority order. Seeds the built-in sources on first
   * boot so the board works out of the box with no manual setup.
   */
  private async loadSources(): Promise<PriceSource[]> {
    let rows = await this.prisma.priceSource.findMany({
      where: { enabled: true },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
    if (!rows.length) rows = await this.seedDefaultSources();
    return rows;
  }

  /** Idempotently create the built-in sources, returning the enabled ones. */
  private async seedDefaultSources(): Promise<PriceSource[]> {
    for (const d of DEFAULT_SOURCES) {
      await this.prisma.priceSource.upsert({
        where: { name: d.name },
        create: { ...d, config: '{}' },
        update: {}, // leave any existing config/priority untouched
      });
    }
    return this.prisma.priceSource.findMany({
      where: { enabled: true },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** Run a source's adapter, returning its quotes and timestamp, or null. */
  private async runAdapter(src: PriceSource): Promise<SourceResult | null> {
    switch (src.kind) {
      case 'akbari':
        return this.fetchAkbariSource();
      case 'tgju':
        return this.fetchTgjuSource();
      case 'estjt':
        return this.fetchEstjtSource();
      case 'trades':
        return this.fetchTradesSource(src);
      case 'manual':
        return this.fetchManualSource(src);
      case 'composite':
        return this.fetchCompositeSource(src);
      default:
        return null;
    }
  }

  /**
   * A source's quotes, served from the per-source cache when fresh. On a fetch
   * failure the last cached reading is served rather than blanking the symbol,
   * so a flaky upstream does not flicker the board.
   */
  private async getSourceQuotes(src: PriceSource): Promise<Record<string, Quote> | null> {
    const hit = this.sourceCache.get(src.name);
    if (hit && Date.now() - hit.updatedAt < CACHE_TTL_MS) return hit.quotes;

    let res: SourceResult | null = null;
    try {
      res = await this.runAdapter(src);
    } catch (err) {
      this.logger.warn(`source ${src.name} (${src.kind}) fetch failed: ${String(err)}`);
      return hit ? hit.quotes : null;
    }

    if (res && Object.keys(res.quotes).length > 0) {
      const ruled = this.applySourceRules(src, res.quotes);
      if (Object.keys(ruled).length > 0) {
        const result: SourceResult = { quotes: ruled, updatedAt: res.updatedAt };
        this.sourceCache.set(src.name, result);
        return result.quotes;
      }
      // Every reading was rejected by the rules → keep the previous cached one.
      return hit ? hit.quotes : null;
    }
    return hit ? hit.quotes : null;
  }

  /** Akbari — primary source, real per-side margins, credentials required. */
  private async fetchAkbariSource(): Promise<SourceResult | null> {
    const cfg = akbariConfig();
    if (!akbariConfigured(cfg)) {
      this.logger.warn('Akbari credentials not set — skipping primary source');
      return null;
    }
    const upstream = await fetchAkbariBoard(cfg);
    return { quotes: this.mapUpstream(upstream), updatedAt: upstream.updatedAt };
  }

  /** TGJU — mid-only public source. */
  private async fetchTgjuSource(): Promise<SourceResult | null> {
    const board = await fetchTgjuBoard();
    return { quotes: this.midQuotesFromRates(board.rates), updatedAt: board.updatedAt };
  }

  /** ESTJT — official union, mid-only public source. */
  private async fetchEstjtSource(): Promise<SourceResult | null> {
    const board = await fetchEstjtBoard();
    return { quotes: this.midQuotesFromRates(board.rates), updatedAt: board.updatedAt };
  }

  /** Map a public mid-only rate set (keyed by canonical rate key) into quotes. */
  private midQuotesFromRates(rates: Map<string, number>): Record<string, Quote> {
    const quotes: Record<string, Quote> = {};
    for (const [rateKey, price] of rates) {
      const symbol = RATE_KEY_TO_SYMBOL[rateKey];
      if (!symbol) continue;
      if (!Number.isFinite(price) || price <= 0) continue;
      // No synthetic spread — public sources only carry a mid price; the client
      // applies its own fee model on top (a double spread would show three
      // visibly different numbers on the board tile).
      quotes[symbol] = { symbol, price: Math.round(price), buy: null, sell: null };
    }
    return quotes;
  }

  /**
   * The trades-derived source — a price tick per symbol built from recent
   * *filled* orders.
   *
   * Side semantics mirror the rest of the platform: a customer BUY fills at the
   * shop's ask (`sell`), a customer SELL fills at the shop's bid (`buy`). So the
   * most recent BUY order's price becomes this source's `sell`, the most recent
   * SELL order's price becomes its `buy`, and the last trade (either side) is
   * the mid `price`. Symbols with no recent trade are simply absent — the next
   * source in the chain fills them.
   *
   * Config: `{ windowMs }` — how far back to look (default 24h).
   */
  private async fetchTradesSource(src: PriceSource): Promise<SourceResult | null> {
    const cfg = this.parseConfig(src.config);
    const windowMs = Number(cfg.windowMs) || 24 * 60 * 60 * 1000;
    const since = new Date(Date.now() - windowMs);

    const orders = await this.prisma.order.findMany({
      where: { status: 'FILLED', createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    // newest-first → the first BUY/SELL seen per symbol is the most recent.
    const latest: Record<string, { buy?: number; sell?: number; price?: number }> = {};
    for (const o of orders) {
      if (!isTradeSymbol(o.symbol)) continue;
      let e = latest[o.symbol];
      if (!e) {
        e = {};
        latest[o.symbol] = e;
      }
      const p = Number(o.price);
      if (!Number.isFinite(p) || p <= 0) continue;
      if (o.side === 'BUY' && e.sell == null) e.sell = p; // customer buys → shop sells
      if (o.side === 'SELL' && e.buy == null) e.buy = p; // customer sells → shop buys
      if (e.price == null) e.price = p; // last trade (first in desc order)
    }

    const quotes: Record<string, Quote> = {};
    for (const [symbol, e] of Object.entries(latest)) {
      const price =
        e.price ??
        (e.buy != null && e.sell != null
          ? Math.round((e.buy + e.sell) / 2)
          : e.buy ?? e.sell ?? 0);
      if (!Number.isFinite(price) || price <= 0) continue;
      quotes[symbol] = {
        symbol,
        price: Math.round(price),
        buy: e.buy != null ? Math.round(e.buy) : null,
        sell: e.sell != null ? Math.round(e.sell) : null,
      };
    }
    return { quotes, updatedAt: Date.now() };
  }

  /**
   * A manual source — per-symbol prices typed in by a super admin, stored in
   * the source's `config` JSON as `{ prices: { GOLD18: { price, buy, sell }, … } }`.
   * It feeds the board like any other source; combined with priority it can
   * fully override the live feed for chosen symbols.
   */
  private async fetchManualSource(src: PriceSource): Promise<SourceResult | null> {
    const cfg = this.parseConfig(src.config);
    const prices = cfg.prices;
    const quotes: Record<string, Quote> = {};
    if (!prices || typeof prices !== 'object') return { quotes, updatedAt: Date.now() };

    for (const [symbol, val] of Object.entries(prices as Record<string, any>)) {
      if (!isTradeSymbol(symbol)) continue;
      const v = val ?? {};
      const buy = v.buy != null ? Math.round(Number(v.buy)) : null;
      const sell = v.sell != null ? Math.round(Number(v.sell)) : null;
      const explicit = v.price != null ? Math.round(Number(v.price)) : null;
      if (buy == null && sell == null && explicit == null) continue;
      const price =
        explicit ??
        (buy != null && sell != null ? Math.round((buy + sell) / 2) : buy ?? sell ?? 0);
      quotes[symbol] = { symbol, price, buy, sell, manual: true };
    }
    return { quotes, updatedAt: Date.now() };
  }

  // ── Composite source & tick-control rules ───────────────────────────────

  /**
   * A composite source combines several other sources into one price per
   * symbol — so a super admin can define new prices from existing feeds.
   * Config:
   *   { formula: 'avg'|'median'|'weighted'|'max'|'min',
   *     inputs: ['akbari','tgju', …],
   *     weights: { akbari: 1, tgju: 2 } }   // 'weighted' only
   *
   * Each input is read through the shared per-source cache; a source cannot
   * reference itself (guard against cycles). A symbol missing from an input
   * simply does not contribute to it. buy/sell are combined the same way when
   * the inputs carry them.
   */
  private async fetchCompositeSource(src: PriceSource): Promise<SourceResult | null> {
    const cfg = this.parseConfig(src.config);
    const inputs: string[] = Array.isArray(cfg.inputs) ? (cfg.inputs as string[]) : [];
    const usable = inputs.filter(n => typeof n === 'string' && n && n !== src.name);
    if (!usable.length) return null;
    const formula = (cfg.formula as string) || 'avg';
    const weights =
      cfg.weights && typeof cfg.weights === 'object' ? (cfg.weights as Record<string, number>) : {};

    const rows = await this.prisma.priceSource.findMany({ where: { name: { in: usable } } });
    const perInput: Record<string, Record<string, Quote>> = {};
    for (const r of rows) {
      const qs = await this.getSourceQuotes(r);
      if (qs) perInput[r.name] = qs;
    }

    const symbols = new Set<string>();
    for (const qs of Object.values(perInput)) for (const s of Object.keys(qs)) symbols.add(s);

    const combine = (vals: number[]): number | null => {
      if (!vals.length) return null;
      if (formula === 'max') return Math.max(...vals);
      if (formula === 'min') return Math.min(...vals);
      if (formula === 'median') {
        const s = [...vals].sort((a, b) => a - b);
        const m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
      }
      return vals.reduce((a, b) => a + b, 0) / vals.length; // avg (and weighted falls back to plain avg)
    };

    const quotes: Record<string, Quote> = {};
    for (const symbol of symbols) {
      const mids: { name: string; v: number }[] = [];
      const buys: number[] = [];
      const sells: number[] = [];
      for (const [name, qs] of Object.entries(perInput)) {
        const q = qs[symbol];
        if (!q) continue;
        mids.push({ name, v: q.price });
        if (q.buy != null) buys.push(q.buy);
        if (q.sell != null) sells.push(q.sell);
      }
      if (!mids.length) continue;

      let price: number;
      if (formula === 'weighted') {
        let wsum = 0;
        let sum = 0;
        for (const { name, v } of mids) {
          const w = Number(weights[name]) || 1;
          wsum += w;
          sum += v * w;
        }
        price = wsum ? sum / wsum : mids[0].v;
      } else {
        price = combine(mids.map(m => m.v)) ?? mids[0].v;
      }
      quotes[symbol] = {
        symbol,
        price: Math.round(price),
        buy: buys.length ? Math.round(combine(buys) ?? buys[0]) : null,
        sell: sells.length ? Math.round(combine(sells) ?? sells[0]) : null,
      };
    }
    return { quotes, updatedAt: Date.now() };
  }

  /**
   * Tick-control rules applied to every source's raw quotes before they are
   * cached, recorded or shown — a super admin's full control over what reaches
   * the board and the history. Config `rules` block (works on any source):
   *   { rules: { clampMin, clampMax, maxDevPct } }
   * - maxDevPct: reject a symbol's new reading when it moves more than this
   *   percent from the last cached reading (outlier/spike filter); the previous
   *   value is kept instead.
   * - clampMin/clampMax: hard floor/ceiling on the price and its sides.
   */
  private applySourceRules(src: PriceSource, quotes: Record<string, Quote>): Record<string, Quote> {
    const cfg = this.parseConfig(src.config);
    const rules = cfg.rules && typeof cfg.rules === 'object' ? (cfg.rules as Record<string, any>) : {};
    const clampMin = rules.clampMin != null && rules.clampMin !== '' ? Number(rules.clampMin) : null;
    const clampMax = rules.clampMax != null && rules.clampMax !== '' ? Number(rules.clampMax) : null;
    const maxDevPct = rules.maxDevPct != null && rules.maxDevPct !== '' ? Number(rules.maxDevPct) : null;
    if (clampMin == null && clampMax == null && maxDevPct == null) return quotes;

    const prev = this.sourceCache.get(src.name)?.quotes ?? {};
    const clamp = (v: number | null): number | null => {
      if (v == null) return null;
      let r = v;
      if (clampMin != null && r < clampMin) r = clampMin;
      if (clampMax != null && r > clampMax) r = clampMax;
      return Math.round(r);
    };

    const out: Record<string, Quote> = {};
    for (const [symbol, q] of Object.entries(quotes)) {
      if (maxDevPct != null) {
        const p = prev[symbol]?.price;
        if (p && (Math.abs(q.price - p) / p) * 100 > maxDevPct) continue; // outlier → keep previous
      }
      out[symbol] = {
        ...q,
        price: clamp(q.price) ?? q.price,
        buy: clamp(q.buy),
        sell: clamp(q.sell),
      };
    }
    return out;
  }

  // ── Tick recorder & queries (super-admin live chart) ─────────────────────

  /**
   * Sample every enabled source and write a price tick per (source, symbol).
   * Each source goes through the shared per-source cache, so a 20s cadence does
   * not re-fetch an upstream more than once per CACHE_TTL_MS. Identical flat
   * ticks are skipped when the last write was recent, so a quiet market does
   * not bloat the table.
   */
  private async recordAllSources(): Promise<void> {
    const sources = await this.loadSources();
    const perSource: Record<string, Record<string, Quote>> = {};
    for (const src of sources) {
      const qs = await this.getSourceQuotes(src);
      if (qs && Object.keys(qs).length > 0) perSource[src.name] = qs;
    }

    const now = Date.now();
    const rows: Prisma.PriceTickCreateManyInput[] = [];
    for (const [sourceName, qs] of Object.entries(perSource)) {
      for (const [symbol, q] of Object.entries(qs)) {
        const key = `${sourceName}|${symbol}`;
        const seen = this.lastTickSeen.get(key);
        const changed = !seen || seen.price !== q.price;
        if (!changed && seen && now - seen.at < 30_000) continue; // skip identical flat tick
        rows.push({
          symbol,
          source: sourceName,
          price: q.price,
          buy: q.buy,
          sell: q.sell,
          recordedAt: new Date(now),
        });
        this.lastTickSeen.set(key, { price: q.price, at: now });
      }
    }
    if (!rows.length) return;
    try {
      await this.prisma.priceTick.createMany({ data: rows });
    } catch (err) {
      this.logger.warn(`tick record failed: ${String(err)}`);
    }
  }

  /** Delete ticks older than the retention window. */
  private async pruneTicks(): Promise<void> {
    const cutoff = new Date(Date.now() - TICK_RETENTION_MS);
    try {
      await this.prisma.priceTick.deleteMany({ where: { recordedAt: { lt: cutoff } } });
    } catch (err) {
      this.logger.warn(`tick prune failed: ${String(err)}`);
    }
  }

  private rangeToMs(range?: string): number {
    switch (range) {
      case '1h':
        return 60 * 60 * 1000;
      case '7d':
        return 7 * 24 * 60 * 60 * 1000;
      case '30d':
        return 30 * 24 * 60 * 60 * 1000;
      case '24h':
      default:
        return 24 * 60 * 60 * 1000;
    }
  }

  /**
   * Price-tick history for the super-admin live chart, filtered by symbol and/or
   * source and limited to a time range. Ordered oldest-first so the chart plots
   * left→right.
   */
  async getTicks(opts: { symbol?: string; source?: string; range?: string }): Promise<PriceTickView[]> {
    const where: Prisma.PriceTickWhereInput = {
      recordedAt: { gte: new Date(Date.now() - this.rangeToMs(opts.range)) },
    };
    if (opts.symbol) where.symbol = opts.symbol;
    if (opts.source) where.source = opts.source;

    const rows = await this.prisma.priceTick.findMany({
      where,
      orderBy: { recordedAt: 'asc' },
      take: 5000,
    });

    return rows.map(r => ({
      symbol: r.symbol,
      source: r.source,
      price: Number(r.price),
      buy: r.buy == null ? null : Number(r.buy),
      sell: r.sell == null ? null : Number(r.sell),
      at: r.recordedAt instanceof Date ? r.recordedAt.getTime() : new Date(r.recordedAt as any).getTime(),
    }));
  }

  /** Every source row (enabled or not) with live health, for the admin UI. */
  async listSources(): Promise<SourceView[]> {
    const rows = await this.prisma.priceSource.findMany({
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(r => this.sourceView(r));
  }

  private sourceView(r: PriceSource): SourceView {
    const hit = this.sourceCache.get(r.name);
    return {
      id: r.id,
      name: r.name,
      kind: r.kind,
      enabled: r.enabled,
      priority: r.priority,
      isSystem: r.isSystem,
      note: r.note ?? '',
      config: this.redactConfig(r.config),
      health: { fresh: !!hit, updatedAt: hit ? hit.updatedAt : null },
      updatedAt: r.updatedAt,
    };
  }

  /** Parsed config with any secret-looking keys stripped before it leaves the API. */
  private redactConfig(config: string | null | undefined): Record<string, unknown> {
    const cfg = this.parseConfig(config);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(cfg)) {
      if (/token|password|secret|uid|apikey|api_key/i.test(k)) continue;
      out[k] = v;
    }
    return out;
  }

  // ── Manual (broker-manager) overrides ──────────────────────────────────

  /**
   * Layer broker-manager overrides on top of the fetched board.
   *
   * Each enabled override fully replaces its symbol's quote with the manager's
   * numbers, written into the *same* `buy`/`sell`/`price` fields the feed uses —
   * so the customer board, the ticker and the order-fill price all read one value
   * whether it came from the feed or was typed in at the shop. An override with
   * no numbers at all is skipped, so an empty form can never blank a live symbol.
   */
  private async applyOverrides(board: Board): Promise<Board> {
    let overrides: BoardPrice[];
    try {
      overrides = await this.prisma.boardPrice.findMany({ where: { enabled: true } });
    } catch (err) {
      // Overrides are an enhancement; the feed board is still valid without them.
      this.logger.warn(`could not read board overrides, serving feed board: ${String(err)}`);
      return board;
    }
    if (!overrides.length) return board;

    const quotes: Record<string, Quote> = { ...board.quotes };
    for (const o of overrides) {
      const buy = o.allowBuy && o.buy != null ? Math.round(Number(o.buy)) : null;
      const sell = o.allowSell && o.sell != null ? Math.round(Number(o.sell)) : null;
      const explicit = o.price != null ? Math.round(Number(o.price)) : null;
      // An empty override is ignored rather than blanking a live symbol.
      if (buy == null && sell == null && explicit == null) continue;
      const price =
        explicit ?? (buy != null && sell != null ? Math.round((buy + sell) / 2) : (buy ?? sell ?? 0));
      quotes[o.symbol] = { symbol: o.symbol, price, buy, sell, manual: true };
    }

    return { ...board, quotes };
  }

  /** Every manual override row, for the broker manager's setup screen. */
  async listOverrides(): Promise<BoardPriceView[]> {
    const rows = await this.prisma.boardPrice.findMany({ orderBy: { symbol: 'asc' } });
    return rows.map(r => this.overrideView(r));
  }

  /**
   * Create or replace a symbol's manual price.
   *
   * Broker-manager only — enforced by the controller's `@Roles`, not here. The
   * cache is cleared so the new number reaches the customer board on the next
   * read rather than after the feed TTL.
   */
  async setOverride(
    actorId: string,
    symbol: string,
    input: {
      price?: number | null;
      buy?: number | null;
      sell?: number | null;
      enabled?: boolean;
      allowBuy?: boolean;
      allowSell?: boolean;
    },
  ): Promise<BoardPriceView> {
    if (!isTradeSymbol(symbol)) throw new TradeError('نماد معاملاتی نامعتبر است');

    const toDec = (v: number | null | undefined) =>
      v == null ? null : new Prisma.Decimal(Math.round(v));

    const data = {
      price: toDec(input.price),
      buy: toDec(input.buy),
      sell: toDec(input.sell),
      enabled: input.enabled ?? true,
      allowBuy: input.allowBuy ?? true,
      allowSell: input.allowSell ?? true,
      updatedById: actorId,
    };

    const row = await this.prisma.boardPrice.upsert({
      where: { symbol },
      create: { symbol, ...data },
      update: data,
    });
    this.invalidate();
    return this.overrideView(row);
  }

  /** Remove a symbol's override so it falls back to the live feed. */
  async clearOverride(symbol: string): Promise<void> {
    if (!isTradeSymbol(symbol)) throw new TradeError('نماد معاملاتی نامعتبر است');
    await this.prisma.boardPrice.deleteMany({ where: { symbol } });
    this.invalidate();
  }

  /** Prisma Decimal → plain number, keeping null as null (not 0). */
  private overrideView(r: BoardPrice): BoardPriceView {
    const num = (v: Prisma.Decimal | null) => (v == null ? null : Number(v));
    return {
      symbol: r.symbol,
      price: num(r.price),
      buy: num(r.buy),
      sell: num(r.sell),
      enabled: r.enabled,
      allowBuy: r.allowBuy,
      allowSell: r.allowSell,
      updatedAt: r.updatedAt,
    };
  }
}
