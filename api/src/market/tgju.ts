/**
 * Upstream price feed: TGJU (شبکه اطلاع‌رسانی طلا و ارز) — gap-fill secondary.
 *
 * A JSON REST API: one indicator per request, e.g.
 *   GET /v1/market/indicator/summary-table-data/geram18
 *   → { data: [["260,393,000", ...], ...] }   (latest row first)
 * The first column of the latest row is the current price, in Rial for gold and
 * coins and in USD for the ounce.
 *
 * The 7 indicators are fetched in parallel batches of 3 with a short pause
 * between batches to stay friendly to the rate limiter. Each indicator is tried
 * twice (one retry) under a 6 s budget (the API often takes 2–3 s). A failed indicator is filled from a
 * durable in-memory memo so the board is never missing a rate during an outage
 * — those memo'd rates are reported as stale so the UI can say so.
 *
 * Rial → Toman is ÷10. geram18 is already per gram and coins are per piece, so
 * no weight conversion is needed.
 */
import {
  RIAL_TO_TOMAN,
  TGJU_SLUG_TO_RATE_KEY,
  parsePrice,
  type PublicBoard,
} from './public-rates';

const BASE_URL = 'https://api.tgju.org/v1/market/indicator/summary-table-data/';
const SLUGS = ['geram18', 'ons', 'sekee', 'sekeb', 'nim', 'rob', 'gerami'];
const BATCH_SIZE = 3;
const BATCH_GAP_MS = 200;
const INDICATOR_TIMEOUT_MS = 6_000;

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Last known converted value per rate key. Durable across polling cycles: when
 * an indicator fails, its rate is filled from here so a TGJU outage still yields
 * a complete board (with those rates marked stale).
 */
const tgjuMemo = new Map<string, number>();

/** Converts a raw Rial (or USD, for the ounce) value to Toman in the display unit. */
function convertTgju(rateKey: string, raw: number): number {
  switch (rateKey) {
    case 'gold18k':
      // geram18 is already per gram — Rial → Toman only.
      return Math.round(raw / RIAL_TO_TOMAN);
    case 'ounceDollar':
      // Already USD; not tradeable, so it passes through raw.
      return Math.round(raw);
    default:
      // Coins: Rial per piece → Toman per piece.
      return Math.round(raw / RIAL_TO_TOMAN);
  }
}

/** Fetches one indicator, retrying once. Returns NaN when both attempts fail. */
async function fetchOne(slug: string): Promise<number> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(BASE_URL + slug, {
        signal: AbortSignal.timeout(INDICATOR_TIMEOUT_MS),
        headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data?: string[][] };
      const row = json.data?.[0];
      // First column of the latest row is the current price.
      const price = parsePrice(row?.[0]);
      if (Number.isFinite(price) && price > 0) return price;
      throw new Error('unparseable price');
    } catch {
      if (attempt === 0) continue;
    }
  }
  return NaN;
}

/**
 * Fetches all indicators in batches, gap-filling failures from the memo.
 *
 * `staleRates` lists the keys that came from the memo (not a fresh fetch) so the
 * caller can flag them; the memo is refreshed whenever a fresh value arrives.
 */
export async function fetchTgjuBoard(): Promise<PublicBoard> {
  const rates = new Map<string, number>();
  const staleRates: string[] = [];

  for (let i = 0; i < SLUGS.length; i += BATCH_SIZE) {
    const batch = SLUGS.slice(i, i + BATCH_SIZE);
    const fetched = await Promise.all(batch.map(async slug => ({ slug, price: await fetchOne(slug) })));

    for (const { slug, price } of fetched) {
      const rateKey = TGJU_SLUG_TO_RATE_KEY[slug];
      if (!rateKey) continue;

      if (Number.isFinite(price) && price > 0) {
        const converted = convertTgju(rateKey, price);
        rates.set(rateKey, converted);
        tgjuMemo.set(rateKey, converted);
      } else if (tgjuMemo.has(rateKey)) {
        // Indicator failed this cycle — serve the last known value, flagged stale.
        rates.set(rateKey, tgjuMemo.get(rateKey) as number);
        staleRates.push(rateKey);
      }
    }

    if (i + BATCH_SIZE < SLUGS.length) await sleep(BATCH_GAP_MS);
  }

  if (!rates.size) throw new Error('tgju returned no rates');

  return { rates, updatedAt: Date.now(), cached: false, staleRates };
}
