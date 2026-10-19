import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '../utils/api.js'
import { useAuthStore } from './auth.js'

/**
 * The signed-in customer's broker storefront.
 *
 * `GET /stores/public/:brokerId` returns the active stores (with their active
 * products) for the broker the current user joined. Customers see one shop —
 * the first store in the list — plus its products. If the user is not signed in
 * or has not joined a broker yet, the store stays empty and the view shows a
 * login/join prompt instead.
 */
export const useBrokerStore = defineStore('brokerStore', () => {
  const store = ref(null)
  const products = ref([])
  const loading = ref(false)
  const error = ref('')

  /** Load the current user's broker store. Returns false when there is nothing
   *  to fetch (not logged in / no broker), so the view can short-circuit. */
  async function fetchMyBrokerStore() {
    const auth = useAuthStore()
    if (!auth.isLoggedIn || !auth.user?.brokerId) {
      store.value = null
      products.value = []
      return false
    }

    loading.value = true
    error.value = ''
    try {
      const stores = await api.get('/stores/public/' + auth.user.brokerId)
      const first = Array.isArray(stores) && stores.length ? stores[0] : null
      store.value = first
      products.value = first?.products ?? []
      return true
    } catch (e) {
      error.value = e?.message || 'دریافت اطلاعات فروشگاه ناموفق بود'
      store.value = null
      products.value = []
      return false
    } finally {
      loading.value = false
    }
  }

  return { store, products, loading, error, fetchMyBrokerStore }
})
