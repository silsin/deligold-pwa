import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '../utils/api.js'

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Convert a base64url VAPID public key to Uint8Array, as required by
 * PushManager.subscribe({ applicationServerKey }).
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/** Encode an ArrayBuffer as base64 (for the subscription keys). */
function arrayBufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

// ── Store ─────────────────────────────────────────────────────────────────

export const usePushStore = defineStore('push', () => {
  const supported = ref(false)
  const permission = ref('default')
  const subscribed = ref(false)
  const loading = ref(false)
  const error = ref('')

  /**
   * Call once after login (or on app boot if already logged in).
   * Reads the current subscription state without prompting for permission.
   */
  async function init() {
    supported.value = 'serviceWorker' in navigator && 'PushManager' in window
    if (!supported.value) return
    permission.value = Notification.permission
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      subscribed.value = !!sub
    } catch {
      subscribed.value = false
    }
  }

  /** Request permission and create a push subscription. */
  async function subscribe() {
    if (!supported.value) return
    loading.value = true
    error.value = ''
    try {
      // Request browser permission
      const perm = await Notification.requestPermission()
      permission.value = perm
      if (perm !== 'granted') {
        error.value = 'دسترسی به اعلان‌ها رد شد. از تنظیمات مرورگر آن را فعال کنید.'
        return
      }

      // Fetch VAPID public key from the server
      const { publicKey } = await api.get('/push/vapid-public-key')
      const applicationServerKey = urlBase64ToUint8Array(publicKey)

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      })

      // Send subscription to the API
      const json = sub.toJSON()
      await api.post('/push/subscribe', {
        endpoint: json.endpoint,
        keys: {
          p256dh: json.keys?.p256dh ?? arrayBufferToBase64(sub.getKey('p256dh')),
          auth: json.keys?.auth ?? arrayBufferToBase64(sub.getKey('auth')),
        },
      })

      subscribed.value = true
    } catch (e) {
      error.value = e?.message ?? 'خطا در فعال‌سازی اعلان‌ها'
      subscribed.value = false
    } finally {
      loading.value = false
    }
  }

  /** Remove the push subscription from browser and server. */
  async function unsubscribe() {
    if (!supported.value) return
    loading.value = true
    error.value = ''
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await api.delete('/push/unsubscribe', { data: { endpoint: sub.endpoint } })
        await sub.unsubscribe()
      }
      subscribed.value = false
    } catch (e) {
      error.value = e?.message ?? 'خطا در غیرفعال‌سازی اعلان‌ها'
    } finally {
      loading.value = false
    }
  }

  return { supported, permission, subscribed, loading, error, init, subscribe, unsubscribe }
})
