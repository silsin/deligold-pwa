import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../utils/api'

/**
 * Live price feed + chart series for every trade symbol.
 *
 * Data comes from the site's own price pipeline, so this store is a thin cache:
 * the SINGLE poller (started by the trading view) refreshes board prices every
 * 15s, while per-symbol 24h stats and chart series are cached locally so a
 * symbol switch feels instant and never triggers a stampede of requests.
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
    const dir = {}
    for (const [key, value] of Object.entries(next)) {
      const before = previous.value[key]
      dir[key] = before === undefined ? 0 : value > before ? 1 : value < before ? -1 : 0
    }
    direction.value = dir
    previous.value = { ...next }
  }

  /**
   * Pull the market once. `record` asks the server to store the sample, which is
   * how the chart accumulates real history over time.
   */
  async function fetchMarket({ withChart = true, record = false } = {}) {
    loading.value = true
    error.value = ''
    try {
      const params = new URLSearchParams()
      if (withChart) params.set('symbol', symbol.value)
      if (withChart) params.set('range', range.value)
      if (record) params.set('record', '1')

      const data = await api.get(`/api/trade/market?${params.toString()}`)

      symbols.value = data.symbols ?? []
      trackDirection(data.prices ?? {})
      prices.value = data.prices ?? {}
      buys.value = data.buys ?? {}
      sells.value = data.sells ?? {}
      source.value = data.source ?? ''
      sourceTitle.value = data.sourceTitle ?? ''
      updatedAt.value = data.updatedAt ?? Date.now()
      stale.value = Boolean(data.stale)
      note.value = data.note ?? ''
      if (data.stats && typeof data.stats === 'object') {
        stats.value = { ...stats.value, ...data.stats }
      }
      if (Array.isArray(data.ranges) && data.ranges.length) ranges.value = data.ranges

      if (withChart) {
        candles.value = data.candles ?? []
        ticks.value = data.ticks ?? []
      }
    } catch (e) {
      error.value = e.message || 'دریافت قیمت‌ها ناموفق بود'
    } finally {
      loading.value = false
    }
  }

  /**
   * 24h stats for every symbol in ONE request — powers the market dropdown so it
   * shows real change/high/low instead of per-symbol guesses.
   */
  async function fetchStats() {
    try {
      const data = await api.get('/api/trade/market?statsOnly=1')
      if (data.stats && typeof data.stats === 'object') {
        stats.value = { ...stats.value, ...data.stats }
      }
    } catch {
      /* non-fatal — the header simply keeps its fallback values */
    }
  }

  /** Auto-refresh loop — the whole point of a live board. */
  function startPolling(intervalMs = 15000) {
    if (polling.value) return
    polling.value = true
    stopPolling()
    pollTimer.value = setInterval(() => {
      if (document.visibilityState === 'visible') {
        // Record every poll so history stays dense; the server throttles anyway.
        void fetchMarket({ record: true })
      }
    }, intervalMs)
  }

  function stopPolling() {
    if (pollTimer.value) clearInterval(pollTimer.value)
    pollTimer.value = null
  }

  async function setSymbol(next) {
    symbol.value = next
    await fetchMarket({ record: true })
  }

  async function setRange(next) {
    range.value = next
    await fetchMarket({ record: false })
  }

  return {
    symbols, prices, buys, sells, source, sourceTitle, updatedAt, stale, note, ranges,
    candles, ticks, symbol, range, loading, error, polling, direction,
    stats, stat, price, meta, rangeOpen, isRangeFallback,
    rangeHigh, rangeLow, change, changePercent, isUp,
    fetchMarket, fetchStats, startPolling, stopPolling, setSymbol, setRange
  }
})
