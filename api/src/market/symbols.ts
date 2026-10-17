/**
 * Tradeable symbols and their metadata.
 *
 * Mirrors `TRADE_SYMBOLS` in delly-gold's `trade-market.ts` so the PWA, the
 * store and this API all describe the same instruments with the same codes.
 *
 * A coin is priced per piece and gold per gram, so `price` of a symbol is
 * directly comparable with what a shopper sees on the storefront.
 */
export interface TradeSymbol {
  symbol: string;
  /** Full Persian name, as shown on the board. */
  name: string;
  /** Short label for tight spaces (charts, cards). */
  short: string;
  /** Unit the price is quoted in — گرم, مثقال, عدد. */
  unit: string;
  kind: 'gold' | 'coin';
  /** True when weight is fractional; coins trade in whole pieces. */
  divisible: boolean;
}

export const TRADE_SYMBOLS: TradeSymbol[] = [
  { symbol: 'GOLD18', name: 'طلای ۱۸ عیار', short: '۱۸ عیار', unit: 'گرم', kind: 'gold', divisible: true },
  { symbol: 'COIN_NEW', name: 'سکه امامی (طرح جدید)', short: 'سکه جدید', unit: 'عدد', kind: 'coin', divisible: false },
  { symbol: 'COIN_OLD', name: 'سکه بهار آزادی (طرح قدیم)', short: 'سکه قدیم', unit: 'عدد', kind: 'coin', divisible: false },
  { symbol: 'COIN_HALF', name: 'نیم سکه', short: 'نیم سکه', unit: 'عدد', kind: 'coin', divisible: false },
  { symbol: 'COIN_QUARTER', name: 'ربع سکه', short: 'ربع سکه', unit: 'عدد', kind: 'coin', divisible: false },
  { symbol: 'COIN_GRAM', name: 'سکه گرمی', short: 'سکه گرمی', unit: 'عدد', kind: 'coin', divisible: false },
];

export const DEFAULT_TRADE_SYMBOL = 'GOLD18';

/** True when the string is a symbol this platform trades. */
export function isTradeSymbol(value: string): boolean {
  return TRADE_SYMBOLS.some(s => s.symbol === value);
}

/** Metadata for a symbol, or null when it is not tradeable. */
export function symbolMeta(symbol: string): TradeSymbol | null {
  return TRADE_SYMBOLS.find(s => s.symbol === symbol) ?? null;
}
