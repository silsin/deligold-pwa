/**
 * Upstream price feed: اتحادیه طلا و جواهر تهران (ESTJT) — the official union.
 *
 * The union publishes a live board at `/tv/` rendered as HTML. Each rate is a
 * `<span data-field="IRG18">26,192,400</span>` card, so the rates are pulled out
 * with a simple regex scan — the markup is predictable and a DOM dependency
 * would be overkill. A `/price/` table is the fallback when the live board is
 * unreachable; it is the same host and reuses the `data-field` convention.
 *
 * The union's numbers are already in Toman and in each symbol's display unit
 * (gold per gram, coins per piece), so no weight conversion is applied.
 *
 * The board request is given a generous timeout because union servers are slow
 * (frequently 1.5–40 s per request); a tight cap would silently freeze prices.
 */
import {
  ESTJT_FIELD_TO_RATE_KEY,
  parsePrice,
  type PublicBoard,
} from './public-rates';

const BOARD_URL = 'https://www.estjt.ir/tv/';
const PRICE_URL = 'https://www.estjt.ir/price/';
const BOARD_TIMEOUT_MS = 8_000;
const PRICE_TIMEOUT_MS = 6_000;
const RETRY_GAP_MS = 400;

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Converts a raw union value to Toman in the symbol's display unit.
 *
 * Every field is already in its display unit: IRG18 is Toman per gram (e.g.
 * 26,178,500 next to a mazaneh of 113,400,000 per مثقال), coins are per piece,
 * and the ounce is USD. Dividing IRG18 by the مثقال weight again produced a
 * ~4.6× too-low gold price that looked like the canned fallback.
 */
function convertEstjt(_rateKey: string, raw: number): number {
  return Math.round(raw);
}

/**
 * Pulls one rate out of the board HTML by its `data-field` attribute.
 *
 * Matches the value element, e.g. `<span ... data-field="IRG18">26,192,400</span>`,
 * and parses its text content. Persian/Arabic digits and separators are handled
 * by `parsePrice`; a missing or empty field returns NaN and is skipped.
 */
function fieldPrice(html: string, field: string): number {
  const re = new RegExp(`data-field=["']${field}["'][^>]*>([^<]*)<`, 'i');
  const m = html.match(re);
  if (!m) return NaN;
  return parsePrice(m[1]);
}

/** Extracts every tradeable rate the board exposes into a rate-key → Toman map. */
function extractRates(html: string): Map<string, number> {
  const rates = new Map<string, number>();
  for (const [field, rateKey] of Object.entries(ESTJT_FIELD_TO_RATE_KEY)) {
    const raw = fieldPrice(html, field);
    if (Number.isFinite(raw) && raw > 0) rates.set(rateKey, convertEstjt(rateKey, raw));
  }
  return rates;
}

/**
 * Fetches the union board, with a /price/ table fallback.
 *
 * Two attempts on the live board with a short gap, then the price table once if
 * the board never came back. Each source is best-effort: a failure falls through
 * to the next, and if nothing is reachable the caller gaps the missing symbols
 * from the other sources rather than crashing the whole board.
 */
export async function fetchEstjtBoard(): Promise<PublicBoard> {
  let html = '';

  for (let attempt = 0; attempt < 2 && !html; attempt++) {
    try {
      const res = await fetch(BOARD_URL, {
        signal: AbortSignal.timeout(BOARD_TIMEOUT_MS),
        headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,*/*' },
      });
      if (res.ok) html = await res.text();
    } catch {
      /* swallow — retry, then fall through to the price table */
    }
    if (!html && attempt === 0) await sleep(RETRY_GAP_MS);
  }

  if (!html) {
    try {
      const res = await fetch(PRICE_URL, {
        signal: AbortSignal.timeout(PRICE_TIMEOUT_MS),
        headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,*/*' },
      });
      if (res.ok) html = await res.text();
    } catch {
      /* swallow — let the caller gap-fill from the other sources */
    }
  }

  if (!html) throw new Error('estjt board and price table unreachable');

  const rates = extractRates(html);
  if (!rates.size) throw new Error('estjt returned no tradeable rates');

  return { rates, updatedAt: Date.now(), cached: false, staleRates: [] };
}
