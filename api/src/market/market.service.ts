import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BoardPrice, Prisma } from '@prisma/client';
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
  /** True when a broker manager set this price manually (overrides the feed). */
  manual?: boolean;
}

export interface Board {
  quotes: Record<string, Quote>;
  /** Which source fed the board: "estjt" | "tgju" | "akbari" | "fallback". */
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

type MarketSourceChoice = 'auto' | 'estjt' | 'tgju' | 'akbari';

/** Which upstream source(s) to consult, from MARKET_SOURCE (default "auto"). */
function marketSourceChoice(env: NodeJS.ProcessEnv = process.env): MarketSourceChoice {
  const v = (env.MARKET_SOURCE ?? 'auto').trim().toLowerCase();
  return v === 'estjt' || v === 'tgju' || v === 'akbari' ? v : 'auto';
}

/**
 * Used when every upstream is unreachable and nothing is cached yet, so the
 * app still boots and the board still renders. Values are deliberately
 * plausible, and `stale: true` tells the UI to say so.
 */
const FALLBACK_PRICES: Record<string, number> = {
  GOLD18: 6_000_000,
  COIN_NEW: 75_000_000,
  COIN_OLD: 72_000_000,
  COIN_HALF: 42_000_000,
  COIN_QUARTER: 24_000_000,
  COIN_GRAM: 13_500_000,
};

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

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    // Warm the cache at boot so the first customer read is instant, then keep
    // it warm on a 5-minute tick — a public union server can take 30+ s, and no
    // customer should wait on that for a board refresh.
    void this.board().catch(err => this.logger.warn(`initial board warm-up failed: ${String(err)}`));
    this.pollTimer = setInterval(() => void this.board().catch(() => {}), POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
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
  async fillPrice(symbol: string, side: 'BUY' | 'SELL'): Promise<number | null> {
    if (!isTradeSymbol(symbol)) return null;
    const quote = (await this.board()).quotes[symbol];
    if (!quote) return null;

    if (side === 'BUY') return quote.sell ?? quote.price;
    return quote.buy ?? quote.price;
  }

  /**
   * Builds the board by walking the source fallback chain.
   *
   * In "auto": ESTJT (the official union) → TGJU gap-fills whatever ESTJT missed
   * → Akbari fills the rest → the last fresh snapshot → the canned fallback.
   * An explicit choice (estjt/tgju/akbari) consults only that source, then
   * snapshot/fallback. Each step is best-effort: a slow or dead source is
   * skipped and the next fills the gaps, so a single outage never blanks the
   * board.
   */
  private async fetchBoard(): Promise<Board> {
    const choice = marketSourceChoice();
    const quotes: Record<string, Quote> = {};
    /** Symbols obtained from a fresh live source this cycle (not memo/snapshot/fallback). */
    const freshSymbols = new Set<string>();
    const staleRateKeys: string[] = [];
    let primarySource = '';
    let updatedAt = Date.now();

    /** Writes a mid-only rate as a two-sided quote; first source wins. */
    const setFromRate = (symbol: string, price: number): boolean => {
      if (quotes[symbol]) return false;
      if (!Number.isFinite(price) || price <= 0) return false;
      const rounded = Math.round(price);
      const { buy, sell } = synthesizeSpread(rounded);
      quotes[symbol] = { symbol, price: rounded, buy, sell };
      return true;
    };

    const missing = () => TRADE_SYMBOLS.some(s => !quotes[s.symbol]);

    // 1. TGJU — fast JSON API, reachable from this server, primary source.
    if (choice === 'tgju' || choice === 'auto') {
      try {
        const board = await fetchTgjuBoard();
        const memoKeys = new Set(board.staleRates);
        for (const [rateKey, price] of board.rates) {
          const symbol = RATE_KEY_TO_SYMBOL[rateKey];
          if (!symbol || quotes[symbol]) continue;
          if (!setFromRate(symbol, price)) continue;
          if (!primarySource) primarySource = 'tgju';
          updatedAt = board.updatedAt;
          if (memoKeys.has(rateKey)) staleRateKeys.push(symbol);
          else freshSymbols.add(symbol);
        }
      } catch (err) {
        this.logger.warn(`tgju fetch failed: ${String(err)}`);
      }
    }

    // 2. ESTJT — official union, try as gap-fill (may be blocked from some IPs).
    if (missing() && (choice === 'estjt' || choice === 'auto')) {
      try {
        const board = await fetchEstjtBoard();
        for (const [rateKey, price] of board.rates) {
          const symbol = RATE_KEY_TO_SYMBOL[rateKey];
          if (symbol && setFromRate(symbol, price)) {
            freshSymbols.add(symbol);
            if (!primarySource) primarySource = 'estjt';
            updatedAt = board.updatedAt;
          }
        }
      } catch (err) {
        this.logger.warn(`estjt fetch failed: ${String(err)}`);
      }
    }

    // 3. Akbari — internal shop system, real per-side margins.
    if (missing() && (choice === 'akbari' || choice === 'auto')) {
      try {
        const cfg = akbariConfig();
        if (akbariConfigured(cfg)) {
          const upstream = await fetchAkbariBoard(cfg);
          const akQuotes = this.mapUpstream(upstream);
          for (const symbol of Object.keys(akQuotes)) {
            if (quotes[symbol]) continue;
            quotes[symbol] = akQuotes[symbol];
            freshSymbols.add(symbol);
            if (!primarySource) primarySource = 'akbari';
            updatedAt = upstream.updatedAt;
          }
        }
      } catch (err) {
        this.logger.warn(`akbari fetch failed: ${String(err)}`);
      }
    }

    // 4. Last fresh snapshot — an old real price beats a canned one.
    if (missing() && this.lastSnapshot) {
      for (const { symbol } of TRADE_SYMBOLS) {
        if (quotes[symbol] || !this.lastSnapshot.quotes[symbol]) continue;
        quotes[symbol] = this.lastSnapshot.quotes[symbol];
        staleRateKeys.push(symbol);
      }
    }

    // 5. Canned fallback — the board still renders when everything else failed.
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
      const { buy, sell } = synthesizeSpread(price);
      quotes[symbol] = { symbol, price, buy, sell };
      staleRateKeys.push(symbol);
    }
  }

  /**
   * The canned board, used when the upstream is unreachable and nothing is
   * cached. Marked stale so the UI can say the numbers are indicative.
   */
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
