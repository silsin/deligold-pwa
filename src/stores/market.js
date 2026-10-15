import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../utils/api'

/**
 * Live price board for the NestJS market service.
 *
 * GET /market/board -> {symbols, quotes:{price,buy,sell}, source, updatedAt,
 * stale}. The store flattens quotes into prices/buys/sells so BoardView,
 * TradingView and WalletView keep working unchanged.
 */
export const useMarketStore = defineStore('market', () => {
  const symbols = ref([])
  const prices = ref({})
  /**
   * akbari-style side quotes, keyed by symbol:
   *   buys[sym]  = what the shop sells at (the customer's BUY side)
   *   sells[sym] = what the shop buys at (the customer's SELL side)
   * Empty objects when the source carries no margins — views then fall back
   * to the symmetric base-fee model.
   */
  const buys = ref({})
  const sells = ref({})
  const source = ref('')
  const sourceTitle = ref('')
  const updatedAt = ref(0)
  const stale = ref(false)
  const note = ref('')
  const ranges = ref(['1h', '24h', '7d', '30d'])

  const candles = ref([])
  const ticks = ref([])
  const symbol = ref('GOLD18')
  const range = ref('24h')

  const loading = ref(false)
  const error = ref('')
  const pollTimer = ref(null)
  const polling = ref(false)

  /** Previous price per symbol, so the UI can flash up/down on change. */
  const previous = ref({})
  const direction = ref({})

  /**
   * Per-symbol 24h window stats, keyed by symbol:
   *   { open, high, low, change, changePercent }
   * Filled by one server round-trip and never overwritten by guesses.
   */
  const stats = ref({})

  const price = computed(() => prices.value[symbol.value] ?? 0)
  const meta = computed(() => symbols.value.find(s => s.symbol === symbol.value) ?? null)
  const stat = computed(() => stats.value[symbol.value] ?? null)

  /**
   * 24h change — prefers the cached stats open (a real 24h window) and otherwise
   * falls back to the visible range's open (clearly labelled in the UI).
   */
  const rangeOpen = computed(() => {
    if (stat.value?.open) return stat.value.open
    if (candles.value.length) return candles.value[0].o
    if (ticks.value.length) return ticks.value[0].price
    return 0
  })

  /** True while the header shows a range fallback instead of a 24h window. */
  const isRangeFallback = computed(() => !stat.value?.open && rangeOpen.value > 0)

  const rangeHigh = computed(() => {
    if (stat.value?.high) return stat.value.high
    return candles.value.length ? Math.max(...candles.value.map(c => c.h)) : price.value
  })
  const rangeLow = computed(() => {
    if (stat.value?.low) return stat.value.low
    return candles.value.length ? Math.min(...candles.value.map(c => c.l)) : price.value
  })

  const change = computed(() => {
    if (stat.value) return stat.value.change
    if (!rangeOpen.value || !price.value) return 0
    return price.value - rangeOpen.value
  })

  const changePercent = computed(() => {
    if (stat.value) return stat.value.changePercent
    if (!rangeOpen.value) return 0
    return (change.value / rangeOpen.value) * 100
  })

  const isUp = computed(() => change.value >= 0)

  function trackDirection(next) {
    // Compute new directions
    for (const [key, value] of Object.entries(next)) {
      const before = previous.value[key]
      const newDir = before === undefined ? 0 : value > before ? 1 : value < before ? -1 : 0
      if (direction.value[key] !== newDir) direction.value[key] = newDir
    }
    // Remove stale keys from direction and previous
    for (const key of Object.keys(direction.value)) {
      if (!(key in next)) delete direction.value[key]
    }
    // Update previous granularly
    for (const [key, value] of Object.entries(next)) {
      if (previous.value[key] !== value) previous.value[key] = value
    }
    for (const key of Object.keys(previous.value)) {
      if (!(key in next)) delete previous.value[key]
    }
  }

  /**
   * Pull the NestJS board once. Charts are synthetic (no candle store yet):
   * keep `candles`/`ticks` empty and derive header stats from the mid price.
   * `background` is true for poll refreshes — skip the loading flag so open
   * modals are never torn down by a routine update.
   */
  async function fetchMarket({ withChart = true, record = false, background = false } = {}) {
    if (!background) loading.value = true;
    error.value = '';
    try {
      const data = await api.get('/market/board');
      
      // Only update symbols if they actually changed
      if (Array.isArray(data.symbols) && data.symbols.length > 0) {
        // Compare by length first (fast check), then by symbol IDs
        if (symbols.value.length !== data.symbols.length || 
            symbols.value.some((s, i) => s.symbol !== data.symbols[i].symbol)) {
          symbols.value = data.symbols;
        }
        // If symbols match, skip the update to avoid triggering reactivity
      } else if (!symbols.value || symbols.value.length === 0) {
        if (Array.isArray(data.symbols) && data.symbols.length > 0) {
          symbols.value = data.symbols;
        }
      }
      
      const quotes = data.quotes ?? {};
      const nextPrices = {};
      const nextBuys = {};
      const nextSells = {};
      for (const [key, q] of Object.entries(quotes)) {
        if (!q || typeof q.price !== 'number') continue;
        nextPrices[key] = q.price;
        if (typeof q.buy === 'number') nextBuys[key] = q.buy;
        if (typeof q.sell === 'number') nextSells[key] = q.sell;
      }
      trackDirection(nextPrices);
      
      // --- prices ---
      // Remove keys that no longer exist in the new data
      for (const key of Object.keys(prices.value)) {
        if (!(key in nextPrices)) delete prices.value[key];
      }
      // Add or update only keys whose value changed
      for (const [key, val] of Object.entries(nextPrices)) {
        if (prices.value[key] !== val) prices.value[key] = val;
      }

      // --- buys ---
      for (const key of Object.keys(buys.value)) {
        if (!(key in nextBuys)) delete buys.value[key];
      }
      for (const [key, val] of Object.entries(nextBuys)) {
        if (buys.value[key] !== val) buys.value[key] = val;
      }

      // --- sells ---
      for (const key of Object.keys(sells.value)) {
        if (!(key in nextSells)) delete sells.value[key];
      }
      for (const [key, val] of Object.entries(nextSells)) {
        if (sells.value[key] !== val) sells.value[key] = val;
      }
      source.value = data.source ?? '';
      sourceTitle.value = data.sourceTitle ?? data.source ?? '';
      updatedAt.value = data.updatedAt ?? Date.now();
      stale.value = Boolean(data.stale);
      note.value = data.note ?? '';
      if (withChart) {
        candles.value = [];
        ticks.value = [];
      }
    } catch (e) {
      error.value = e.message || 'دریافت قیمت‌ها ناموفق بود';
      console.error('Market fetch error:', e);
    } finally {
      if (!background) loading.value = false;
    }
  }

  /** No NestJS stats endpoint yet — keep cached values only. */
  async function fetchStats() {
    return stats.value;
  }

  /** Auto-refresh loop — the whole point of a live board. */
  function startPolling(intervalMs = 15000) {
    if (polling.value) return;
    polling.value = true;
    stopPolling();
    pollTimer.value = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchMarket({ withChart: false, background: true });
      }
    }, intervalMs);
  }

  function stopPolling() {
    if (pollTimer.value) clearInterval(pollTimer.value)
    pollTimer.value = null
  }

  async function setSymbol(next) {
    symbol.value = next;
    await fetchMarket({ withChart: false });
  }

  async function setRange(next) {
    range.value = next;
    await fetchMarket({ withChart: false });
  }

  // ── Manual (broker-manager) price overrides ──────────────────────────────
  // These hit the staff-guarded /market/prices routes. They are kept out of the
  // reactive board state on purpose: the manager's edits only reach customers
  // after the API layers them over the feed, which the next board poll shows.

  /** Every stored override, keyed by symbol, for the manager's setup screen. */
  async function fetchOverrides() {
    const rows = await api.get('/market/prices');
    const bySymbol = {};
    for (const r of Array.isArray(rows) ? rows : []) bySymbol[r.symbol] = r;
    return bySymbol;
  }

  /**
   * Create or replace one symbol's manual price. Returns the saved row, or
   * `{ ok: false, error }` so the caller can surface the message like the auth
   * store's staff actions do.
   */
  async function saveOverride(symbol, payload) {
    try {
      const row = await api.put(`/market/prices/${symbol}`, payload);
      // The board changed — refresh so the caller sees the new number at once.
      await fetchMarket({ withChart: false });
      return { ok: true, row };
    } catch (e) {
      return { ok: false, error: e.message || 'ذخیره قیمت ناموفق بود' };
    }
  }

  /** Drop a symbol's override so it follows the live feed again. */
  async function clearOverride(symbol) {
    try {
      await api.delete(`/market/prices/${symbol}`);
      await fetchMarket({ withChart: false });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message || 'حذف قیمت ناموفق بود' };
    }
  }

  return {
    symbols, prices, buys, sells, source, sourceTitle, updatedAt, stale, note, ranges,
    candles, ticks, symbol, range, loading, error, polling, direction,
    stats, stat, price, meta, rangeOpen, isRangeFallback,
    rangeHigh, rangeLow, change, changePercent, isUp,
    fetchMarket, fetchStats, startPolling, stopPolling, setSymbol, setRange,
    fetchOverrides, saveOverride, clearOverride
  }
})
