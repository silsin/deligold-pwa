import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '../utils/api.js'

export const useNotificationsStore = defineStore('notifications', () => {
  const items = ref([])
  const unreadCount = ref(0)
  const loading = ref(false)
  const error = ref('')

  async function fetch() {
    loading.value = true
    error.value = ''
    try {
      const res = await api.get('/notifications')
      // api interceptor unwraps { success, data } → data
      const data = res?.data ?? res
      items.value = Array.isArray(data) ? data : []
      await fetchUnreadCount()
    } catch (e) {
      error.value = e?.message || 'دریافت پیام‌ها ناموفق بود'
    } finally {
      loading.value = false
    }
  }

  async function fetchUnreadCount() {
    try {
      const res = await api.get('/notifications/unread-count')
      const data = res?.data ?? res
      unreadCount.value = Number(data?.count ?? 0)
    } catch {
      // non-critical — keep previous count
    }
  }

  async function markRead(id) {
    try {
      await api.patch(`/notifications/${id}/read`, {})
      const item = items.value.find(n => n.id === id)
      if (item) item.read = true
      await fetchUnreadCount()
    } catch (e) {
      error.value = e?.message || 'خطا در خواندن پیام'
    }
  }

  async function markAllRead() {
    try {
      await api.patch('/notifications/read-all', {})
      items.value.forEach(n => { n.read = true })
      unreadCount.value = 0
    } catch (e) {
      error.value = e?.message || 'خطا در خواندن همه پیام‌ها'
    }
  }

  async function broadcast(dto) {
    try {
      const result = await api.post('/notifications/broadcast', dto)
      return { ok: true, result }
    } catch (e) {
      error.value = e?.message || 'ارسال اطلاعیه ناموفق بود'
      return { ok: false, error: error.value }
    }
  }

  return { items, unreadCount, loading, error, fetch, fetchUnreadCount, markRead, markAllRead, broadcast }
})
