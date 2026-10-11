import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../utils/api'
import { useAuthStore } from './auth'

/**
 * Wholesale ordering — the goldsmith's workflow.
 *
 * Unlike the old spot-trading board, nothing here fills instantly. The
 * goldsmith builds a basket from the live catalog (each line priced from the
 * same gold board the site shows), submits it, and the supplier moves it
 * through PENDING → CONFIRMED → PREPARING → DELIVERED. Debt (نسیه) accrues on
 * each order and is paid down over time.
 */
export const useWholesaleStore = defineStore('wholesale', () => {
  const auth = useAuthStore()

  // Catalog + live pricing
  const items = ref([])
  const prices = ref({})
  const source = ref('')
  const sourceTitle = ref('')
  const updatedAt = ref(0)
  const stale = ref(false)
  const note = ref('')
  const loadingCatalog = ref(false)

  // Basket: itemId → qty (only lines with qty > 0 are sent)
  const basket = ref({})

  const orders = ref([])
  const loadingOrders = ref(false)

  const debt = ref(0)
  const ledger = ref([])

  const error = ref('')
  const submitting = ref(false)

  // ── Catalog ───────────────────────────────────────────────────────────────
  async function fetchCatalog() {
    loadingCatalog.value = true
    error.value = ''
    try {
      const data = await api.get('/api/trade/catalog')
      items.value = data.items ?? []
      prices.value = data.prices ?? {}
      source.value = data.source ?? ''
      sourceTitle.value = data.sourceTitle ?? ''
      updatedAt.value = data.updatedAt ?? Date.now()
      stale.value = Boolean(data.stale)
      note.value = data.note ?? ''
    } catch (e) {
      error.value = e.message || 'دریافت کاتالوگ ناموفق بود'
    } finally {
      loadingCatalog.value = false
    }
  }

  // ── Basket ────────────────────────────────────────────────────────────────
  function qtyOf(itemId) {
    return basket.value[itemId] ?? 0
  }

  function setQty(itemId, qty) {
    const n = Math.max(0, Number(qty) || 0)
    if (n <= 0) delete basket.value[itemId]
    else basket.value[itemId] = n
  }

  function bump(itemId, delta, min = 1, max = 999) {
    const next = Math.min(max, Math.max(min, qtyOf(itemId) + delta))
    if (next <= 0) delete basket.value[itemId]
    else basket.value[itemId] = next
  }

  function removeLine(itemId) {
    delete basket.value[itemId]
  }

  function clearBasket() {
    basket.value = {}
  }

  const basketLines = computed(() =>
    items.value
      .filter(it => (basket.value[it.id] ?? 0) > 0)
      .map(it => ({
        item: it,
        qty: basket.value[it.id],
        lineTotal: (it.unitPrice ?? 0) * basket.value[it.id]
      }))
  )

  const basketCount = computed(() => basketLines.value.length)
  const basketQty = computed(() => basketLines.value.reduce((s, l) => s + l.qty, 0))
  const basketTotal = computed(() => basketLines.value.reduce((s, l) => s + l.lineTotal, 0))

  // ── Orders ────────────────────────────────────────────────────────────────
  async function fetchOrders() {
    if (!auth.isLoggedIn) return
    loadingOrders.value = true
    try {
      const data = await api.get('/api/trade/orders')
      orders.value = data.orders ?? []
    } catch (e) {
      error.value = e.message || 'دریافت سفارش‌ها ناموفق بود'
    } finally {
      loadingOrders.value = false
    }
  }

  async function submit(note = '') {
    if (!basketLines.value.length) {
      error.value = 'سبد خرید خالی است'
      return null
    }
    if (!auth.isLoggedIn) {
      error.value = 'برای ثبت سفارش باید وارد شوید'
      return null
    }
    submitting.value = true
    error.value = ''
    try {
      const lines = basketLines.value.map(l => ({ itemId: l.item.id, qty: l.qty }))
      const data = await api.post('/api/trade/orders', { lines, note })
      clearBasket()
      await Promise.all([fetchOrders(), fetchLedger()])
      return data.order ?? null
    } catch (e) {
      error.value = e.message || 'ثبت سفارش ناموفق بود'
      return null
    } finally {
      submitting.value = false
    }
  }

  async function cancelOrder(id) {
    try {
      await api.post(`/api/trade/orders/${id}/cancel`)
      await Promise.all([fetchOrders(), fetchLedger()])
      return true
    } catch (e) {
      error.value = e.message || 'لغو سفارش ناموفق بود'
      return false
    }
  }

  // ── Ledger (نسیه) ─────────────────────────────────────────────────────────
  async function fetchLedger() {
    if (!auth.isLoggedIn) return
    try {
      // The API returns `entries`; the component reads `ledger`.
      const data = await api.get('/api/trade/ledger')
      debt.value = data.debt ?? 0
      ledger.value = data.entries ?? data.ledger ?? []
    } catch (e) {
      error.value = e.message || 'دریافت دفتر بدهی ناموفق بود'
    }
  }

  /** Record a settlement (پرداخت) against the outstanding balance. */
  async function payDebt(amount, note = '') {
    try {
      const data = await api.post('/api/trade/ledger', { amount, note })
      debt.value = data.debt ?? 0
      ledger.value = data.entries ?? data.ledger ?? []
      return true
    } catch (e) {
      error.value = e.message || 'ثبت پرداخت ناموفق بود'
      return false
    }
  }

  async function loadEverything() {
    await fetchCatalog()
    if (auth.isLoggedIn) {
      await Promise.all([fetchOrders(), fetchLedger()])
    }
  }

  return {
    items, prices, source, sourceTitle, updatedAt, stale, note,
    loadingCatalog, basket, orders, loadingOrders, debt, ledger,
    error, submitting,
    basketLines, basketCount, basketQty, basketTotal,
    fetchCatalog, qtyOf, setQty, bump, removeLine, clearBasket,
    fetchOrders, submit, cancelOrder, fetchLedger, payDebt, loadEverything
  }
})
