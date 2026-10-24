import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '../utils/api'

/**
 * Super-admin trade explorer: every buy/sell across all users and brokers.
 *
 * GET /superadmin/trades?symbol&side&status&brokerId&userId&from&to&limit
 * GET /superadmin/brokers → broker filter dropdown
 */
export const useTradesStore = defineStore('trades', () => {
  const trades = ref([])
  const brokers = ref([])
  const loading = ref(false)
  const error = ref('')

  async function fetchTrades(filters = {}) {
    loading.value = true
    error.value = ''
    try {
      const params = new URLSearchParams()
      for (const [k, v] of Object.entries(filters)) {
        if (v !== undefined && v !== null && v !== '') params.set(k, v)
      }
      trades.value = await api.get(`/superadmin/trades?${params.toString()}`)
    } catch (e) {
      error.value = e.message || 'دریافت معاملات ناموفق بود'
    } finally {
      loading.value = false
    }
  }

  async function fetchBrokers() {
    brokers.value = await api.get('/superadmin/brokers')
  }

  return { trades, brokers, loading, error, fetchTrades, fetchBrokers }
})
