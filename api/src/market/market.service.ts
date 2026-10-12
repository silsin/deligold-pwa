import { Injectable, Logger } from '@nestjs/common';
import { DEFAULT_TRADE_SYMBOL, TRADE_SYMBOLS, isTradeSymbol, type TradeSymbol } from './symbols';

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
      const res = await fetch('http://internal/api/admin/gold-price?source=auto', {
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) throw new Error(`upstream ${res.status}`);

      const json = (await res.json()) as {
        data?: {
          source?: string;
          rates?: Record<string, number | undefined>;
          buys?: Record<string, number | undefined>;
          sells?: Record<string, number | undefined>;
        };
      };
      const d = json?.data ?? {};
      const quotes = this.mapQuotes(d.rates ?? {}, d.buys ?? {}, d.sells ?? {});

      if (!Object.keys(quotes).length) throw new Error('upstream returned no rates');

      return { quotes, source: d.source ?? 'upstream', updatedAt: Date.now(), stale: false };
    } catch (err) {
      this.logger.warn(
        `price fetch failed, serving ${this.cache ? 'cached' : 'fallback'} board: ${String(err)}`,
      );
      return this.fallbackBoard();
    }
  }

  /**
   * Builds quotes from raw upstream rates.
   *
   * `buys`/`sells` are the shop's bid/ask. A quote is only accepted when its
   * base price exists and the pair is sane (both positive, bid ≤ ask); when the
   * source supplies no pair we synthesise one around the mid instead.
   */
  private mapQuotes(
    rates: Record<string, number | undefined>,
    buys: Record<string, number | undefined>,
    sells: Record<string, number | undefined>,
  ): Record<string, Quote> {
    const quotes: Record<string, Quote> = {};

    for (const { symbol } of TRADE_SYMBOLS) {
      const raw = rates[symbol];
      const price = Math.round(Number(raw));
      if (!Number.isFinite(price) || price <= 0) continue;

      const buyRaw = Math.round(Number(buys[symbol]));
      const sellRaw = Math.round(Number(sells[symbol]));
      const pairOk =
        Number.isFinite(buyRaw) && Number.isFinite(sellRaw) && buyRaw > 0 && sellRaw > 0 && buyRaw <= sellRaw;

      if (pairOk) {
        quotes[symbol] = { symbol, price, buy: buyRaw, sell: sellRaw };
      } else {
        // Synthesise a symmetric spread so a single-price source still yields a
        // two-sided book rather than filling both directions identically.
        const half = (price * DEFAULT_SPREAD_PERCENT) / 100;
        quotes[symbol] = {
          symbol,
          price,
          buy: Math.round(price - half),
          sell: Math.round(price + half),
        };
      }
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

