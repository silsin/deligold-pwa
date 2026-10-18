/**
 * Upstream price feed: akbarigold.ir
 *
 * POST JSON with credentials → returns prices[] array.
 * Prices are in RIAL. Gold rows have rate = grams per مثقال (e.g. 4.3318).
 * Coins are per piece.
 *
 * Unit conversions:
 *   Gold  Toman/gram  = price(Rial) ÷ 10 ÷ rate
 *   Coins Toman/piece = price(Rial) ÷ 10
 *
 * Buy/sell spreads (what the customer actually pays/receives):
 *   buy  side = price + profit + masterProfit        (customer pays more)
 *   sell side = price - profitSell - masterProfitSell (customer receives less)
 *   Then convert to Toman with the same ÷10÷rate formula.
 *   If allowBuy/allowSell = 0, that side is null (closed).
 *
 * ID → symbol mapping (verified 2026-10-18):
 *   id 1  — نقد دوشنبه   (type 1, active)  → GOLD18   primary
 *   id 7  — نقد سه‌شنبه  (type 1, active)  → GOLD18   fallback
 *   id 3  — سکه تمام/امامی (type 2, active) → COIN_NEW
 *   id 4  — نیم سکه      (type 2, active)  → COIN_HALF
 *   id 8  — تمام قدیم    (type 2, inactive) → COIN_OLD
 *   id 6  — ربع۴۰۳       (type 2, inactive) → COIN_QUARTER
 *   id 5  — ربع سکه      (type 2, inactive) → COIN_QUARTER fallback
 */

export interface UpstreamPrice {
  id: number;
  name: string;
  type: number;        // 1 = gold (weight), 2 = coin (piece)
  rate: number;        // grams per مثقال for type=1 rows
  ayar: number;        // fineness per-mille
  price: number;       // mid price in RIAL
  priceBuy: number;    // explicit buy offset from price (Rial), 0 if not set
  priceSell: number;   // explicit sell offset from price (Rial), 0 if not set
  profit: number;      // buy margin in Rial (added to price)
  profitSell: number;  // sell margin in Rial (subtracted from price)
  masterProfit: number;
  masterProfitSell: number;
  isActive: number;
  allowBuy: number;
  allowSell: number;
  lastUpdateTime: string;
}

export interface UpstreamBoard {
  cached: boolean;
  rows: Map<number, UpstreamPrice>;
  updatedAt: number;
}

/**
 * ID → symbol mapping, priority order (first active row wins per symbol).
 */
const ID_TO_SYMBOL: Array<[number, string]> = [
  [1,   'GOLD18'],       // نقد دوشنبه — primary gold
  [7,   'GOLD18'],       // نقد سه‌شنبه — fallback gold
  [3,   'COIN_NEW'],     // سکه تمام / امامی
  [4,   'COIN_HALF'],    // نیم سکه
  [8,   'COIN_OLD'],     // تمام قدیم
  [6,   'COIN_QUARTER'], // ربع۴۰۳
  [5,   'COIN_QUARTER'], // ربع سکه
];

export const SYMBOL_TO_UPSTREAM_ID: Record<string, number> = ID_TO_SYMBOL.reduce<Record<string, number>>(
  (acc, [id, symbol]) => { if (!(symbol in acc)) acc[symbol] = id; return acc; }, {},
);

export const SYMBOL_TO_ALL_IDS: Record<string, number[]> = ID_TO_SYMBOL.reduce<Record<string, number[]>>(
  (acc, [id, symbol]) => { if (!acc[symbol]) acc[symbol] = []; acc[symbol].push(id); return acc; }, {},
);

export interface AkbariConfig { url: string; uid: string; token: string; }

export function akbariConfig(env: NodeJS.ProcessEnv = process.env): AkbariConfig {
  return {
    url: env.MARKET_UPSTREAM_URL?.trim() || 'https://akbarigold.ir/server/api/prices/list.php',
    uid: env.MARKET_UID?.trim() ?? '',
    token: env.MARKET_TOKEN?.trim() ?? '',
  };
}

export function akbariConfigured(cfg: AkbariConfig): boolean {
  return Boolean(cfg.uid) && Boolean(cfg.token);
}

export async function fetchAkbariBoard(cfg: AkbariConfig, timeoutMs = 10_000): Promise<UpstreamBoard> {
  if (!akbariConfigured(cfg)) {
    throw new Error('akbarigold credentials missing (set MARKET_UID and MARKET_TOKEN)');
  }

  const form = new URLSearchParams();
  form.set('uID', cfg.uid);
  form.set('uToken', cfg.token);
  form.set('all', 'true');

  const res = await fetch(cfg.url, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Origin': 'https://akbarigold.ir',
      'Referer': 'https://akbarigold.ir/trade',
    },
    body: form,
  });

  if (!res.ok) throw new Error(`akbarigold HTTP ${res.status}`);

  const json = (await res.json()) as {
    state?: boolean;
    msg?: string;
    IS_CACHE?: boolean;
    prices?: UpstreamPrice[];
    lastUpdateTime?: string;
  };

  if (!json.state) throw new Error(`akbarigold rejected: ${json.msg ?? 'unknown error'}`);
  if (!Array.isArray(json.prices) || !json.prices.length) throw new Error('akbarigold returned no prices');

  const rows = new Map<number, UpstreamPrice>();
  for (const row of json.prices) {
    if (row && typeof row.id === 'number') rows.set(row.id, row);
  }

  // Use the global lastUpdateTime (Tehran local = UTC+3:30)
  const globalTs = json.lastUpdateTime
    ? Date.parse(`${json.lastUpdateTime.replace(' ', 'T')}+03:30`)
    : NaN;

  const updatedAt = Number.isFinite(globalTs) ? globalTs : Date.now();

  return { cached: Boolean(json.IS_CACHE), rows, updatedAt };
}

/**
 * Convert an upstream row to a customer-facing quote in Toman.
 *
 * All prices from the API are in Rial — divide by 10 for Toman.
 * Gold rows are per مثقال — divide by rate (grams/مثقال) for per-gram.
 *
 * Buy  = (price + profit + masterProfit) ÷ 10 [÷ rate for gold]
 * Sell = (price - profitSell - masterProfitSell) ÷ 10 [÷ rate for gold]
 *
 * Returns null when the row is inactive.
 */
export function akbariTwoSided(
  row: UpstreamPrice,
): { price: number; buy: number | null; sell: number | null } | null {
  if (!row.isActive) return null;

  const priceRial = Number(row.price);
  if (!Number.isFinite(priceRial) || priceRial <= 0) return null;

  const isGold = row.type === 1;
  const rate = isGold ? (Number(row.rate) || 4.3318) : 1;

  // Display price matches akbarigold.ir board.
  // All margin fields (profit, masterProfit) are in Rial regardless of moneyUnitMaster.
  // Formula: (price - profit - masterProfit) / 10 / rate
  const profitRial      = Number(row.profit)       || 0;
  const masterProfitRial = Number(row.masterProfit) || 0;

  const toToman = (rial: number) => Math.round(rial / 10 / rate);

  const midToman = toToman(priceRial - profitRial - masterProfitRial);
  if (midToman <= 0) return null;

  return { price: midToman, buy: null, sell: null };
}
