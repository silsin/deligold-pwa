import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, setToken, getToken } from '../utils/api'

/**
 * Session store for the PWA.
 *
 * The token lives in localStorage because the app runs on a different origin
 * than the API — cookies cannot be sent or set cross-origin here. On boot we try
 * `/api/trade/account` with any stored token; a 401 clears it silently.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const token = ref(getToken())
  const wallet = ref(null)
  const positions = ref([])
  const orders = ref([])
  const equity = ref(0)
  const totalPnl = ref(0)
  const feePercent = ref(0.5)
  const loading = ref(false)
  const error = ref('')

  const isLoggedIn = computed(() => Boolean(token.value))
  const balance = computed(() => wallet.value?.balance ?? 0)

  /** A symbol the user currently holds, or null. */
  function positionOf(symbol) {
    return positions.value.find(p => p.symbol === symbol) ?? null
  }

  function applyAccount(data) {
    user.value = data.user ?? null
    wallet.value = data.wallet ?? null
    positions.value = data.positions ?? []
    orders.value = data.orders ?? []
    equity.value = data.equity ?? 0
    totalPnl.value = data.totalPnl ?? 0
    if (typeof data.feePercent === 'number') feePercent.value = data.feePercent
  }

  async function login(identifier, password) {
    loading.value = true
    error.value = ''
    try {
      const data = await api.post('/api/trade/login', { identifier, password })
      token.value = data.token
      setToken(data.token)
      applyAccount({ user: data.user })
      return true
    } catch (e) {
      error.value = e.message || 'ورود ناموفق بود'
      return false
    } finally {
      loading.value = false
    }
  }

  /** Refresh wallet/positions/orders from the server. */
  async function fetchAccount() {
    if (!token.value) return false
    try {
      const data = await api.get('/api/trade/account')
      applyAccount(data)
      return true
    } catch (e) {
      // An expired or revoked token should not trap the user in a broken state.
      logout()
      error.value = e.message || 'نشست منقضی شده است'
      return false
    }
  }

  async function placeOrder(payload) {
    loading.value = true
    error.value = ''
    try {
      const data = await api.post('/api/trade/order', payload)
      applyAccount(data)
      return { ok: true, order: data.order }
    } catch (e) {
      error.value = e.message || 'ثبت سفارش ناموفق بود'
      return { ok: false, error: error.value }
    } finally {
      loading.value = false
    }
  }

  async function addFunds(amount) {
    loading.value = true
    error.value = ''
    try {
      const data = await api.post('/api/trade/deposit', { amount })
      wallet.value = data.wallet ?? wallet.value
      return { ok: true, wallet: data.wallet }
    } catch (e) {
      error.value = e.message || 'واریز ناموفق بود'
      return { ok: false, error: error.value }
    } finally {
      loading.value = false
    }
  }

  function logout() {
    user.value = null
    wallet.value = null
    positions.value = []
    orders.value = []
    equity.value = 0
    token.value = null
    setToken(null)
  }

  return {
    user, token, wallet, positions, orders, equity, totalPnl, feePercent,
    loading, error, isLoggedIn, balance, positionOf,
    login, fetchAccount, placeOrder, addFunds, logout
  }
})
