import { Injectable, Logger } from '@nestjs/common';
import { DEFAULT_TRADE_SYMBOL, TRADE_SYMBOLS, isTradeSymbol, type TradeSymbol } from './symbols';
import {
  SYMBOL_TO_UPSTREAM_ID,
  akbariConfig,
  akbariConfigured,
  akbariTwoSided,
  fetchAkbariBoard,
  type UpstreamBoard,
} from './akbari';

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
}

export interface Board {
  quotes: Record<string, Quote>;
  source: string;
  updatedAt: number;
  /** True when the last fetch failed and we are serving a cached/fallback board. */
  stale: boolean;
}

/** How long a fetched board is served before the next request re-fetches it. */
const CACHE_TTL_MS = 30_000;

/**
 * Used when the upstream is unreachable and we have nothing cached yet, so the
 * app still boots and the board still renders. Values are deliberately
 * plausible, and `stale: true` tells the UI to say so.
 */
const FALLBACK_PRICES: Record<string, number> = {
  GOLD18: 6_000_000,
  GOLD24: 8_000_000,
  MAZANEH: 34_500_000,
  COIN_NEW: 75_000_000,
  COIN_OLD: 72_000_000,
  COIN_HALF: 42_000_000,
  COIN_QUARTER: 24_000_000,
  COIN_GRAM: 13_500_000,
};

/** Spread applied when a source quotes a single price with no bid/ask pair. */
const DEFAULT_SPREAD_PERCENT = 0.5;

@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);

  private cache: Board | null = null;
  private inflight: Promise<Board> | null = null;

  /**
   * The current board, fetching a fresh one when the cache has expired.
   *
   * Concurrent callers share one in-flight fetch rather than each triggering
   * their own — the board is polled by every connected client, so without this
   * a single tick would fan out into dozens of upstream requests.
   */
  async board(): Promise<Board> {
    if (this.cache && Date.now() - this.cache.updatedAt < CACHE_TTL_MS) {
      return this.cache;
    }
    if (this.inflight) return this.inflight;

    this.inflight = this.fetchBoard()
      .then(board => {
        this.cache = board;
        return board;
      })
      .finally(() => {
        this.inflight = null;
      });

    return this.inflight;
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
   * Fetches the upstream board, falling back to the canned one on failure.
   *
   * A failure is not fatal: a trading app that shows "no data" because a public
   * site hiccupped is worse than one that shows a slightly old number with a
   * stale badge on it.
   */
  private async fetchBoard(): Promise<Board> {
    try {
      const cfg = akbariConfig();

      if (akbariConfigured(cfg)) {
        const upstream = await fetchAkbariBoard(cfg);
        const quotes = this.mapUpstream(upstream);
        if (!Object.keys(quotes).length) throw new Error('upstream carried no tradeable symbols');

        return {
          quotes,
          source: 'akbarigold',
          // Keep the upstream's own clock so the board's age is honest.
          updatedAt: upstream.updatedAt,
          stale: false,
        };
      }

      // No credentials: the feed cannot be read, so say so loudly rather than
      // silently serving numbers nobody set.
      this.logger.error(
        'MARKET_UID / MARKET_TOKEN are not set — the board cannot fetch real prices and will ' +
          'show indicative fallback values. Set them in the environment (see api/.env).',
      );
      return this.fallbackBoard();
    } catch (err) {
      this.logger.warn(
        `price fetch failed, serving ${this.cache ? 'cached' : 'fallback'} board: ${String(err)}`,
      );
      return this.fallbackBoard();
    }
  }

  /**
   * Builds quotes from the upstream's row map.
   *
   * A row we cannot map, or one the shop has switched off, is simply absent —
   * the board never invents a price for an instrument it was not given.
   */
  private mapUpstream(upstream: UpstreamBoard): Record<string, Quote> {
    const quotes: Record<string, Quote> = {};

    for (const { symbol } of TRADE_SYMBOLS) {
      const id = SYMBOL_TO_UPSTREAM_ID[symbol];
      if (id === undefined) continue;

      const row = upstream.rows.get(id);
      if (!row) continue;

      const twoSided = akbariTwoSided(row);
      if (!twoSided) continue;

      quotes[symbol] = {
        symbol,
        price: twoSided.price,
        buy: twoSided.buy,
        sell: twoSided.sell,
      };
    }

    return quotes;
  }

  /**
   * The canned board, used when the upstream is unreachable and nothing is
   * cached. Marked stale so the UI can say the numbers are indicative.
   */
  private fallbackBoard(): Board {
    const quotes: Record<string, Quote> = {};
    for (const { symbol } of TRADE_SYMBOLS) {
      const price = FALLBACK_PRICES[symbol];
      if (!price) continue;
      const half = (price * DEFAULT_SPREAD_PERCENT) / 100;
      quotes[symbol] = {
        symbol,
        price,
        buy: Math.round(price - half),
        sell: Math.round(price + half),
      };
    }
    return { quotes, source: 'fallback', updatedAt: Date.now(), stale: true };
  }
}

