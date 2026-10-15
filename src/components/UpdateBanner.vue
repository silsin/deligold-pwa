<template>
  <Transition name="banner">
    <div v-if="needsUpdate" class="update-banner" role="alert">
      <i class="material-icons">system_update</i>
      <span>نسخه جدید در دسترس است</span>
      <button type="button" class="update-banner__btn" @click="applyUpdate">به‌روزرسانی</button>
      <button type="button" class="update-banner__dismiss" aria-label="بستن" @click="needsUpdate = false">
        <i class="material-icons">close</i>
      </button>
    </div>
  </Transition>
</template>

<script setup>
import { ref } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'

const needsUpdate = ref(false)

const { updateServiceWorker } = useRegisterSW({
  // Fires when a new SW is waiting — show the banner
  onNeedRefresh() {
    needsUpdate.value = true
  },
  // Already offline-ready (first install) — no banner needed
  onOfflineReady() {},
})

function applyUpdate() {
  needsUpdate.value = false
  // Tell the waiting SW to skip waiting, then reload to get the new build
  updateServiceWorker(true)
}
</script>

<style scoped>
.update-banner {
  position: fixed;
  bottom: calc(60px + env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  z-index: 200;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px 11px 12px;
  border-radius: 14px;
  background: var(--accent);
  color: #14100a;
  font-size: 13px;
  font-weight: 800;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
  white-space: nowrap;
  max-width: calc(100vw - 32px);
}

.update-banner .material-icons {
  font-size: 19px;
  flex-shrink: 0;
}

.update-banner span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.update-banner__btn {
  padding: 6px 14px;
  border-radius: 9px;
  background: #14100a;
  color: var(--accent);
  font-size: 12.5px;
  font-weight: 900;
  flex-shrink: 0;
}

.update-banner__dismiss {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.15);
  flex-shrink: 0;
}

.update-banner__dismiss .material-icons {
  font-size: 15px;
}

/* Slide up from below */
.banner-enter-active,
.banner-leave-active {
  transition: transform 0.3s cubic-bezier(0.22, 0.68, 0.36, 1), opacity 0.25s ease;
}

.banner-enter-from,
.banner-leave-to {
  transform: translateX(-50%) translateY(120%);
  opacity: 0;
}
</style>
