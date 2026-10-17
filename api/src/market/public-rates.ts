/**
 * Shared types and mapping for the public price sources (ESTJT, TGJU).
 *
 * Both the Union (ESTJT) and the news network (TGJU) publish a single mid price
 * per instrument — no bid/ask — so the shop's two-sided quote is synthesised from
 * the mid with a fixed spread, exactly as the canned fallback board does.
 *
 * Akbari is intentionally NOT here: it carries real per-side margins and its own
 * row-id model, so it stays in `akbari.ts` and is mapped separately.
 */

/** مثقال (mesghal) is 4.608 g — the weight the union quotes gold per. */
export const MESGHAL_TO_GRAM = 4.608;

/** Rial → Toman is a fixed ÷10. */
export const RIAL_TO_TOMAN = 10;

/** Spread applied when a source quotes a single price with no bid/ask pair. */
export const DEFAULT_SPREAD_PERCENT = 0.5;

/**
 * Canonical rate key → tradeable symbol. `ounceDollar` is deliberately absent:
 * the ounce is a global USD price with no tradeable symbol on this platform, so
 * the fetchers still collect it (to mirror the upstream design and keep the
 * TGJU memo complete) but the board never surfaces it.
 */
export const RATE_KEY_TO_SYMBOL: Record<string, string> = {
  gold18k: 'GOLD18',
  coinOld: 'COIN_OLD',
  coinNew: 'COIN_NEW',
  coinHalf: 'COIN_HALF',
  coinQuarter: 'COIN_QUARTER',
  coinGram: 'COIN_GRAM',
};

/** ESTJT `data-field` attribute → canonical rate key. */
export const ESTJT_FIELD_TO_RATE_KEY: Record<string, string> = {
  IRG18: 'gold18k',
  IRG24: 'gold24k',
  IRG17: 'mazanehTehran',
  GOLD: 'ounceDollar',
  IRCOLD: 'coinOld',
  IRCNEW: 'coinNew',
  IRC2: 'coinHalf',
  IRC4: 'coinQuarter',
  IRCGRAM: 'coinGram',
};

/** TGJU indicator slug → canonical rate key. */
export const TGJU_SLUG_TO_RATE_KEY: Record<string, string> = {
  geram18: 'gold18k',
  geram24: 'gold24k',
  ons: 'ounceDollar',
  sekee: 'coinNew',
  sekeb: 'coinOld',
  nim: 'coinHalf',
  rob: 'coinQuarter',
  gerami: 'coinGram',
};

/**
 * Normalised board from a public (mid-only) source.
 *
 * `rates` is keyed by canonical rate key and already converted to Toman in the
 * symbol's display unit (gold per gram, mazaneh per مثقال, coins per piece).
 * `staleRates` lists keys that came from the in-memory memo rather than a fresh
 * fetch, so the caller can flag them as old.
 */
export interface PublicBoard {
  rates: Map<string, number>;
  updatedAt: number;
  /** Upstream's own "I served a cached reading" flag, when it reports one. */
  cached: boolean;
  /** Rate keys filled from the in-memory memo (last known values). */
  staleRates: string[];
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Persian (۰-۹) and Arabic (٠-٩) digits → ASCII so Number() can parse them. */
export function toAsciiDigits(s: string): string {
  let out = '';
  for (const ch of s) {
    const fp = FA_DIGITS.indexOf(ch);
    if (fp >= 0) {
      out += String(fp);
      continue;
    }
    const ap = AR_DIGITS.indexOf(ch);
    if (ap >= 0) {
      out += String(ap);
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Parse a price string that may carry Persian/Arabic digits and thousands
 * separators (comma, Persian comma). Everything that is not a digit or a
 * decimal point is dropped, which handles the separators both sources use.
 */
export function parsePrice(s: string | undefined | null): number {
  if (!s) return NaN;
  const cleaned = toAsciiDigits(s).replace(/[^0-9.]/g, '').trim();
  if (!cleaned) return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/** Build a symmetric two-sided quote from a mid price (half a spread each side). */
export function synthesizeSpread(price: number): { buy: number; sell: number } {
  const half = Math.round((price * DEFAULT_SPREAD_PERCENT) / 100);
  return { buy: price - half, sell: price + half };
}
