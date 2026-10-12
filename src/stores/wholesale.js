import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '../utils/api'

/**
 * Staff/broker store — backed only by existing NestJS routes:
 * GET /stores, GET /stores/:id/movements,
 * GET /reports/trial-balance, GET /reports/trades.
 */
export const useStoresStore = defineStore('stores', () => {
  const stores = ref([])
  const movementsByStore = ref({})
  const reports = ref({ trialBalance: null, trades: null })
  const loading = ref(false)
  const error = ref('')

  // ── Stores ────────────────────────────────────────────────────────────────
  async function fetchStores() {
    loading.value = true
    error.value = ''
    try {
      const data = await api.get('/stores')
      stores.value = data.stores ?? data ?? []
    } catch (e) {
      error.value = e.message || 'دریافت فروشگاه‌ها ناموفق بود'
    } finally {
      loading.value = false
    }
  }

  // ── Movements ─────────────────────────────────────────────────────────────
  async function fetchMovements(id) {
    loading.value = true
    error.value = ''
    try {
      const data = await api.get(`/stores/${id}/movements`)
      movementsByStore.value[id] = data.movements ?? data ?? []
    } catch (e) {
      error.value = e.message || 'دریافت گردش فروشگاه ناموفق بود'
    } finally {
      loading.value = false
    }
  }

  // ── Reports ─────────────────────────────────────────────────────────────────
  async function fetchReports(params = {}) {
    loading.value = true
    error.value = ''
    try {
      const q = new URLSearchParams(params).toString()
      const suffix = q ? `?${q}` : ''
      const [tb, tr] = await Promise.all([
        api.get(`/reports/trial-balance${suffix}`),
        api.get(`/reports/trades${suffix}`)
      ])
      reports.value = { trialBalance: tb ?? null, trades: tr ?? null }
    } catch (e) {
      error.value = e.message || 'دریافت گزارش‌ها ناموفق بود'
    } finally {
      loading.value = false
    }
  }

  return {
    stores, movementsByStore, reports,
    loading, error,
    fetchStores, fetchMovements, fetchReports
  }
})
