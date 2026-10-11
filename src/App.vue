<template>
  <div class="app">
    <header class="topbar">
      <button type="button" class="topbar__menu" aria-label="منو" @click="drawerOpen = true">
  <i class="material-icons">menu</i>
</button>
      <div class="topbar__brand">
        <span class="topbar__logo">دلی گلد</span>
        <span class="topbar__sub">معاملات طلا</span>
      </div>
      <div class="topbar__meta">
        <span v-if="market.stale" class="topbar__stale">داده قدیمی</span>
        <span class="topbar__clock">{{ clock }}</span>
        <RouterLink v-if="auth.isLoggedIn" to="/account" class="topbar__wallet">
          {{ faMoney(auth.balance) }}
        </RouterLink>
        <RouterLink v-else to="/login" class="topbar__login">ورود</RouterLink>
      </div>
    </header>

    <main class="content">
      <RouterView v-slot="{ Component }">
        <KeepAlive>
          <component :is="Component" />
        </KeepAlive>
      </RouterView>
    </main>

    <nav class="tabbar">
      <RouterLink to="/" class="tab" exact>
        <i class="tab__icon material-icons">sell</i>
        <span class="tab__label">قیمت‌ها</span>
      </RouterLink>
      <RouterLink to="/trade" class="tab">
        <i class="tab__icon material-icons">show_chart</i>
        <span class="tab__label">معاملات</span>
      </RouterLink>
      <RouterLink to="/history" class="tab">
        <i class="tab__icon material-icons">history</i>
        <span class="tab__label">تاریخچه</span>
      </RouterLink>
      <RouterLink to="/account" class="tab">
        <i class="tab__icon material-icons">account_circle</i>
        <span class="tab__label">حساب</span>
      </RouterLink>
    </nav>

    <AppDrawer :open="drawerOpen" @close="drawerOpen = false" />

    <!-- First-visit gate: manager terms must be acknowledged once per device. -->
    <TermsModal v-if="showTerms" required @close="showTerms = false" />
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { useMarketStore } from './stores/market'
import { useAuthStore } from './stores/auth'
import AppDrawer from './components/AppDrawer.vue'
import TermsModal from './components/TermsModal.vue'
import { applyPalette, loadPaletteId } from './theme'
import { faMoney, faTime, termsAccepted } from './utils/format'

const market = useMarketStore()
const auth = useAuthStore()
const clock = ref('')
const drawerOpen = ref(false)
const showTerms = ref(false)
let timer = null

function tick() {
  clock.value = faTime(Date.now())
}

onMounted(() => {
  applyPalette(loadPaletteId())
  showTerms.value = !termsAccepted()
  tick()
  timer = setInterval(tick, 1000)
})

onBeforeUnmount(() => {
  market.stopPolling()
  if (timer) clearInterval(timer)
})
</script>

<style>
/* Global: no scoping here — tokens and resets must reach every view. */
:root {
  --radius: 16px;
  --radius-sm: 12px;
  --accent: #d4af37;
  --accent-light: #f0d060;
  --bg: #0e0e0e;
  --bg-secondary: #111111;
  --surface: #161616;
  --card: #1a1a1a;
  --border: #2a2a2a;
  --text: #ffffff;
  --text-muted: #888888;
  --up: #26a65b;
  --down: #ef4444;
  --up-soft: rgba(38, 166, 91, 0.14);
  --down-soft: rgba(239, 68, 68, 0.14);
}

* {
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

html,
body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--text);
  /* Sourced from the token in style.css — Vazirmatn, self-hosted for offline. */
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.6;
}

#app {
  min-height: 100vh;
  min-height: 100dvh;
}

button {
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
}
</style>

<style scoped>
.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 16px;
  padding-top: calc(12px + env(safe-area-inset-top));
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
}

.topbar__menu {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: 16px;
  color: var(--text);
}

.topbar__brand {
  flex: 1;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 8px;
}

.topbar__logo {
  font-size: 17px;
  font-weight: 900;
  color: var(--accent);
}

.topbar__sub {
  font-size: 11px;
  color: var(--text-muted);
}

.topbar__meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.topbar__clock {
  font-size: 12px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.topbar__stale {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--down-soft);
  color: var(--down);
  font-size: 10px;
  font-weight: 800;
}

.topbar__wallet {
  padding: 4px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  border: 1px solid var(--accent);
  color: var(--accent);
  font-size: 11.5px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.topbar__login {
  padding: 4px 14px;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}

.content {
  flex: 1;
}

.tabbar {
  position: sticky;
  bottom: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  background: var(--bg-secondary);
  border-top: 1px solid var(--border);
}

.tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 9px 0 10px;
  color: var(--text-muted);
  transition: color 0.15s ease;
}

.tab__icon {
  font-size: 17px;
  line-height: 1;
}

.tab__label {
  font-size: 10.5px;
  font-weight: 700;
}

.tab.router-link-active {
  color: var(--accent);
}
</style>

