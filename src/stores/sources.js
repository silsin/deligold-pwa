import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '../utils/api'

/**
 * Super-admin price-source management + the live price-tick chart.
 *
 * GET  /superadmin/sources   → every source with live health
 * POST /superadmin/sources    → create a manual/trades source
 * PATCH /superadmin/sources/:id → toggle / reprioritise / configure / note
 * DELETE /superadmin/sources/:id → delete a non-system source
 * POST /superadmin/sources/reorder → set priorities in one call
 * GET  /superadmin/ticks?symbol&source&range → tick history for the chart
 * GET  /superadmin/symbols → tradeable symbol catalogue
 */
export const useSourcesStore = defineStore('sources', () => {
  const sources = ref([])
  const symbols = ref([])
  const ticks = ref([])
  const loading = ref(false)
  const error = ref('')
  let tickTimer = null

  async function fetchSources() {
    error.value = ''
    try {
      const [list, syms] = await Promise.all([
        api.get('/superadmin/sources'),
        api.get('/superadmin/symbols'),
      ])
      sources.value = list || []
      symbols.value = syms || []
    } catch (e) {
      error.value = e.message || 'دریافت منابع ناموفق بود'
    }
  }

  async function createSource(payload) {
    return api.post('/superadmin/sources', payload)
  }

  async function updateSource(id, payload) {
    return api.patch(`/superadmin/sources/${id}`, payload)
  }

  async function deleteSource(id) {
    return api.delete(`/superadmin/sources/${id}`)
  }

  async function reorderSources(items) {
    return api.post('/superadmin/sources/reorder', { items })
  }

  /** Fetch tick history for the live chart. */
  async function fetchTicks({ symbol, source, range } = {}) {
    const params = new URLSearchParams()
    if (symbol) params.set('symbol', symbol)
    if (source) params.set('source', source)
    if (range) params.set('range', range)
    ticks.value = await api.get(`/superadmin/ticks?${params.toString()}`)
  }

  /** Start a polling loop that re-fetches ticks (and refreshes sources). */
  function startTickPolling(onTick, intervalMs = 8000) {
    stopTickPolling()
    tickTimer = setInterval(onTick, intervalMs)
  }

  function stopTickPolling() {
    if (tickTimer) clearInterval(tickTimer)
    tickTimer = null
  }

  return {
    sources, symbols, ticks, loading, error,
    fetchSources, createSource, updateSource, deleteSource, reorderSources,
    fetchTicks, startTickPolling, stopTickPolling,
  }
})
