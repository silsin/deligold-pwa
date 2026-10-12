/**
 * Upstream price feed: akbarigold.ir (the same provider the shop's own site uses).
 *
 * This is a JSON API reached over POST — a plain GET returns an empty 200 — so
 * it needs `all` plus the operator credentials (`uID`/`uToken`) in the JSON
 * body. A browser `User-Agent` is required; without one the host answers 403
 * before ever looking at the credentials.
 *
 * Every value is configured, never hard-coded, because the token is rotated by
 * the upstream and a hard-coded one would silently start serving the stale
 * fallback board the moment it expired — which is exactly how the previous
 * `http://internal/...` feed failed.
 */

/** One row of the upstream `prices[]` array. Only the fields we read are named. */
export interface UpstreamPrice {
  id: number;
  name: string;
  /** 1 = gold/weight products, 2 = coins. */
  type: number;
  /** Fineness in per-mille — 750 is 18k. Meaningful for gold rows. */
  ayar: number;
  /** Mid price in Toman. */
  price: number;
  /**
   * Bid/ask offsets from `price`, not absolute prices: `priceBuy` is added to
   * get what a customer PAYS, `priceSell` to get what they RECEIVE. Both are 0
   * on rows that instead quote a symmetric `profit` margin.
   */
  priceBuy: number;
  priceSell: number;
  /** Symmetric margin in Toman, used when priceBuy/priceSell are both 0. */
  profit: number;
  min: number;
  max: number;
  dailyAmount: number;
  isActive: number;
  allowBuy: number;
  allowSell: number;
  lastUpdateTime: string;
}

export interface UpstreamBoard {
  /** Upstream's own signal that it served a cached reading. */
  cached: boolean;
  /** Per-upstream-id row map, so the caller decides what is tradeable. */
  rows: Map<number, UpstreamPrice>;
  /** Unix ms of the upstream's own timestamp, or now when unparseable. */
  updatedAt: number;
}

/**
 * Upstream row id -> our internal symbol, in source order.
 *
 * Stored as an array of pairs rather than a Record on purpose: a Record keyed by
 * these numeric ids would be re-ordered by JS into ascending-integer order
 * (1, 4, 5, 6, 7, 8, 501) regardless of how it is written, which silently
 * decides duplicate rows by numeric value instead of by intent. An array keeps
 * the source order the developer actually typed.
 */
const ID_TO_SYMBOL: Array<[number, string]> = [
  [501, 'GOLD18'], // طلا مفرقه سالم (عیار ۷۵۰)
  [1, 'GOLD24'], // نقد شنبه
  [7, 'MAZANEH'], // نقد یکشنبه
  [8, 'COIN_OLD'], // تمام قدیم
  [6, 'COIN_QUARTER'], // ربع ۴۰۳
  [5, 'COIN_QUARTER'], // ربع سکه — second feed for the same coin
  [4, 'COIN_HALF'], // نیم سکه
];

/** Our symbol -> upstream row id. First match in source order wins. */
export const SYMBOL_TO_UPSTREAM_ID: Record<string, number> = ID_TO_SYMBOL.reduce<Record<string, number>>(
  (acc, [id, symbol]) => {
    if (!(symbol in acc)) acc[symbol] = id;
    return acc;
  },
  {},
);

export interface AkbariConfig {
  url: string;
  uid: string;
  token: string;
}

/**
 * Provider config from the environment.
 *
 * `MARKET_UID` / `MARKET_TOKEN` are operator credentials — treat them like a
 * password: server-side only, never exposed to the client, never committed.
 */
export function akbariConfig(env: NodeJS.ProcessEnv = process.env): AkbariConfig {
  return {
    url: env.MARKET_UPSTREAM_URL?.trim() || 'https://akbarigold.ir/server/api/prices/list.php',
    uid: env.MARKET_UID?.trim() ?? '',
    token: env.MARKET_TOKEN?.trim() ?? '',
  };
}

/** True when the credentials needed to call the upstream are present. */
export function akbariConfigured(cfg: AkbariConfig): boolean {
  return Boolean(cfg.uid) && Boolean(cfg.token);
}

/**
 * Fetches the upstream board.
 *
 * A 403 carrying `{"msg":"invalid credentials"}` means the token was rotated.
 * That is a configuration problem, not an outage, so it throws instead of
 * quietly degrading to the fallback board.
 */
export async function fetchAkbariBoard(cfg: AkbariConfig, timeoutMs = 8_000): Promise<UpstreamBoard> {
  if (!akbariConfigured(cfg)) {
    throw new Error('akbarigold credentials missing (set MARKET_UID and MARKET_TOKEN)');
  }

  const res = await fetch(cfg.url, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain, */*',
      // Without a browser UA the host returns 403 before checking the token.
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      Origin: new URL(cfg.url).origin,
    },
    body: JSON.stringify({ all: true, uID: cfg.uid, uToken: cfg.token }),
  });

  if (!res.ok) throw new Error(`akbarigold HTTP ${res.status}`);

  const json = (await res.json()) as {
    state?: boolean;
    msg?: string;
    IS_CACHE?: boolean;
    prices?: UpstreamPrice[];
  };

  if (!json.state) {
    throw new Error(`akbarigold rejected the request: ${json.msg ?? 'unknown error'}`);
  }
  if (!Array.isArray(json.prices) || !json.prices.length) {
    throw new Error('akbarigold returned no prices');
  }

  const rows = new Map<number, UpstreamPrice>();
  for (const row of json.prices) {
    if (row && typeof row.id === 'number') rows.set(row.id, row);
  }

  // Trust the upstream's own clock, so a cached reading still shows when the
  // price was actually set rather than when we happened to receive it.
  const stamps = [...rows.values()]
    .map(r => Date.parse(`${r.lastUpdateTime.replace(' ', 'T')}Z`))
    .filter(t => Number.isFinite(t));

  return {
    cached: Boolean(json.IS_CACHE),
    rows,
    updatedAt: stamps.length ? Math.max(...stamps) : Date.now(),
  };
}

/**
 * Derives the customer-facing bid and ask from an upstream row.
 *
 * Explicit offsets win when present; otherwise the symmetric `profit` margin is
 * used. A side that the shop has switched off resolves to null so an order can
 * never fill against a quote that has been closed.
 */
export function akbariTwoSided(
  row: UpstreamPrice,
): { price: number; buy: number | null; sell: number | null } | null {
  if (!row.isActive) return null;

  const price = Math.round(Number(row.price));
  if (!Number.isFinite(price) || price <= 0) return null;

  const buyOff = Math.round(Number(row.priceBuy) || 0);
  const sellOff = Math.round(Number(row.priceSell) || 0);
  const profit = Math.round(Number(row.profit) || 0);

  const buyAsk = row.allowBuy ? (buyOff || profit ? price + (buyOff || profit) : price) : null;
  const sellBid = row.allowSell ? (sellOff || -profit ? price + (sellOff || -profit) : price) : null;

  return { price, buy: buyAsk, sell: sellBid };
}