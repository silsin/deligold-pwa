<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="show" class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal__scrim" @click="dismiss"></div>
        <div class="modal__card">
          <button type="button" class="modal__x" aria-label="بستن" @click="dismiss">
            <i class="material-icons">close</i>
          </button>

          <div class="modal__icon">
            <i class="material-icons">notifications_active</i>
          </div>

          <h2 id="modal-title" class="modal__title">فعال کردن اعلان‌ها</h2>
          <p class="modal__text">
            اعلان‌های پوش به شما اطلاع می‌دهند زمانی که کیف‌پول شما شارژ شود یا سفارشات شما تغییر وضعیت دهند.
          </p>

          <div class="modal__actions">
            <button type="button" class="btn btn--primary" :disabled="subscribing" @click="subscribe">
              <span v-if="subscribing" class="spin" aria-hidden="true"></span>
              {{ subscribing ? 'در حال فعال‌سازی…' : 'فعال کردن اعلان‌ها' }}
            </button>
            <button type="button" class="btn btn--secondary" :disabled="subscribing" @click="dismiss">
              {{ subscribing ? 'صبر کنید…' : 'بعداً' }}
            </button>
          </div>

          <p v-if="error" class="modal__err">
            <i class="material-icons">error_outline</i>{{ error }}
          </p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false }
})

const emit = defineEmits(['dismiss', 'subscribed'])

const subscribing = ref(false)
const error = ref('')

const show = computed(() => props.visible && !subscribing.value)

onMounted(() => {
  // Check if push notifications are already supported
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    // Browser doesn't support push notifications
    emit('dismiss')
  }
})

async function subscribe() {
  subscribing.value = true
  error.value = ''

  try {
    // Request permission from the user
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      error.value = 'اجازه اعلان‌ها داده نشد. لطفاً تنظیمات مرورگر را بررسی کنید.'
      subscribing.value = false
      return
    }

    // Get the service worker registration
    const registration = await navigator.serviceWorker.ready
    if (!registration.pushManager) {
      throw new Error('PushManager not available')
    }

    // Get the VAPID public key from the server
    const vapidResponse = await fetch('/api/push/vapid-public-key')
    if (!vapidResponse.ok) throw new Error('Failed to fetch VAPID key')
    const { publicKey } = await vapidResponse.json()

    // Subscribe to push notifications
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    })

    // Send subscription to the backend
    const subscribeResponse = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription),
      credentials: 'include'
    })

    if (!subscribeResponse.ok) throw new Error('Failed to save subscription')

    // Store preference to not show this prompt again for a while
    localStorage.setItem('push_subscribed_at', Date.now().toString())

    emit('subscribed')
    subscribing.value = false
  } catch (err) {
    error.value = err.message || 'خرابی در فعال‌سازی اعلان‌ها'
    subscribing.value = false
  }
}

function dismiss() {
  // Remember that the user dismissed this, so don't spam them
  localStorage.setItem('push_dismissed_at', Date.now().toString())
  emit('dismiss')
}

/**
 * Convert VAPID public key from base64 to Uint8Array
 * Required by the PushManager.subscribe() API
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}
</script>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal__scrim {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
}

.modal__card {
  position: relative;
  width: calc(100% - 32px);
  max-width: 360px;
  border-radius: 16px;
  background: var(--card);
  border: 1px solid var(--border);
  padding: 24px 20px;
  text-align: center;
}

.modal__x {
  position: absolute;
  top: 10px;
  left: 10px;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--surface);
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
}

.modal__icon {
  font-size: 40px;
  color: var(--accent);
  margin-bottom: 12px;
}

.modal__title {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 800;
  color: var(--text);
}

.modal__text {
  margin: 0 0 20px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-muted);
}

.modal__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.btn {
  padding: 12px 16px;
  border-radius: 10px;
  border: 1px solid transparent;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  outline: none;
}

.btn--primary {
  background: var(--accent);
  color: #fff;
}

.btn--primary:disabled {
  opacity: 0.6;
}

.btn--secondary {
  background: transparent;
  border-color: var(--border);
  color: var(--text-muted);
}

.btn--secondary:disabled {
  opacity: 0.5;
}

.modal__err {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 0;
  font-size: 11.5px;
  color: var(--down);
}

.modal__err .material-icons {
  font-size: 15px;
}

.spin {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── Modal transition ──────────────────────────────────────────────────────── */

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .modal__card {
  animation: modalSlideUp 0.3s ease;
}

.modal-leave-active .modal__card {
  animation: modalSlideDown 0.3s ease reverse;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

@keyframes modalSlideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes modalSlideDown {
  to {
    transform: translateY(20px);
    opacity: 0;
  }
}
</style>
