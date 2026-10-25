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
      // Coerce: a misconfigured proxy that returns the SPA index.html would
      // otherwise hand us a string and break the v-for/.map in the views.
      sources.value = Array.isArray(list) ? list : []
      symbols.value = Array.isArray(syms) ? syms : []
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
    const data = await api.get(`/superadmin/ticks?${params.toString()}`)
    ticks.value = Array.isArray(data) ? data : []
  }

  // ── Tick history & moderation ─────────────────────────────────────────────
  async function fetchTickHistory(filters = {}) {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== null && v !== '') params.set(k, v)
    }
    const data = await api.get(`/superadmin/ticks/history?${params.toString()}`)
    return data || { rows: [], total: 0 }
  }
  async function deleteTick(id) {
    return api.delete(`/superadmin/ticks/${id}`)
  }
  async function clearTicks(payload) {
    return api.post('/superadmin/ticks/clear', payload)
  }

  // ── Chart annotations (drawings) ────────────────────────────────────────
  const annotations = ref([])
  async function fetchAnnotations(symbol) {
    const data = await api.get(`/superadmin/annotations?symbol=${encodeURIComponent(symbol)}`)
    // points are stored as a JSON string server-side → parse to an array.
    annotations.value = (Array.isArray(data) ? data : []).map(a => ({
      ...a,
      points: typeof a.points === 'string' ? safeParse(a.points) : a.points || [],
    }))
  }
  async function createAnnotation(payload) {
    return api.post('/superadmin/annotations', payload)
  }
  async function deleteAnnotation(id) {
    return api.delete(`/superadmin/annotations/${id}`)
  }

  function safeParse(s) {
    try { return JSON.parse(s) } catch { return [] }
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
    sources, symbols, ticks, loading, error, annotations,
    fetchSources, createSource, updateSource, deleteSource, reorderSources,
    fetchTicks, startTickPolling, stopTickPolling,
    fetchTickHistory, deleteTick, clearTicks,
    fetchAnnotations, createAnnotation, deleteAnnotation,
  }
})
