<template>
  <div class="app">
    <header class="topbar">
      <div class="topbar__start">
        <button type="button" class="topbar__menu" aria-label="منو" @click="drawerOpen = true">
          <i class="material-icons">menu</i>
        </button>
        <span class="topbar__logo">دلی گلد</span>
      </div>
      <div class="topbar__meta">
        <span class="topbar__clock">{{ clock }}</span>
        <RouterLink v-if="auth.isLoggedIn" to="/account" class="topbar__wallet">
          <i class="material-icons">account_balance_wallet</i>
          <span>{{ faMoney(auth.balance) }}</span>
        </RouterLink>
        <button v-else type="button" class="topbar__login" @click="openLogin('login')">ورود</button>
      </div>
    </header>

    <main class="content">
      <RouterView v-slot="{ Component }">
        <KeepAlive>
          <component :is="Component" />
        </KeepAlive>
      </RouterView>
    </main>

    <!--
      Guests only get the public tabs; the account tabs are gated and raise the
      login sheet instead of navigating. Signed-in users get the full set.
    -->
    <nav class="tabbar">
      <RouterLink to="/" class="tab" exact>
        <i class="tab__icon material-icons">sell</i>
        <span class="tab__label">قیمت‌ها</span>
      </RouterLink>

      <RouterLink v-if="!auth.isLoggedIn" to="/markets" class="tab">
        <i class="tab__icon material-icons">storefront</i>
        <span class="tab__label">بازار</span>
      </RouterLink>

      <RouterLink v-else to="/trade" class="tab">
        <i class="tab__icon material-icons">show_chart</i>
        <span class="tab__label">معاملات</span>
      </RouterLink>

      <button v-if="!auth.isLoggedIn" type="button" class="tab tab--gate" @click="openLogin('register')">
        <i class="tab__icon material-icons">lock</i>
        <span class="tab__label">معاملات</span>
      </button>

      <RouterLink v-if="auth.isLoggedIn" to="/history" class="tab">
        <i class="tab__icon material-icons">history</i>
        <span class="tab__label">تاریخچه</span>
      </RouterLink>

      <button v-else type="button" class="tab tab--gate" @click="openLogin('login')">
        <i class="tab__icon material-icons">history</i>
        <span class="tab__label">تاریخچه</span>
      </button>

      <RouterLink v-if="auth.isLoggedIn" to="/account" class="tab">
        <i class="tab__icon material-icons">account_circle</i>
        <span class="tab__label">حساب</span>
      </RouterLink>

      <button v-else type="button" class="tab tab--gate" @click="openLogin('login')">
        <i class="tab__icon material-icons">account_circle</i>
        <span class="tab__label">حساب</span>
      </button>
    </nav>

    <AppDrawer :open="drawerOpen" @close="drawerOpen = false" />

    <LoginSheet />

    <!-- First-visit gate: manager terms must be acknowledged once per device. -->
    <TermsModal v-if="showTerms" required @close="showTerms = false" />

    <!-- PWA update banner — appears when a new build is deployed -->
    <UpdateBanner />
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { useMarketStore } from './stores/market'
import { useAuthStore } from './stores/auth'
import AppDrawer from './components/AppDrawer.vue'
import LoginSheet from './components/LoginSheet.vue'
import TermsModal from './components/TermsModal.vue'
import UpdateBanner from './components/UpdateBanner.vue'
import { applyPalette, loadPaletteId } from './theme'
import { faMoney, faTime, termsAccepted } from './utils/format'
import { readInviteCode } from './utils/invite.js'
import { openLogin, authGate } from './utils/authGate.js'
import { api } from './utils/api.js'

const market = useMarketStore()
const auth = useAuthStore()
const clock = ref('')
const drawerOpen = ref(false)
const showTerms = ref(false)
let timer = null

function tick() {
  clock.value = faTime(Date.now())
}

async function handleInviteCode() {
  const code = readInviteCode()
  if (!code || auth.isLoggedIn) return

  try {
    const res = await api.get(`/invites/${code}`)
    if (res.data) {
      authGate.pendingInvite = {
        code,
        brokerName: res.data.brokerName,
      }
      openLogin('register')
    }
  } catch (e) {
    // Invalid invite code — show error in auth sheet
    authGate.pendingInvite = null
  }
}

onMounted(() => {
  applyPalette(loadPaletteId())
  showTerms.value = !termsAccepted()
  tick()
  timer = setInterval(tick, 1000)
  
  // Check for ?invite= before restoring session
  handleInviteCode()

  // Restore the persisted session: a stored token means "still logged in".
  // Without this the guard sees an empty user and every reopen looks logged out
  // until something happens to fetch the profile.
  if (auth.token && !auth.user) {
    void auth.ensureSession()
  }
  if (auth.isLoggedIn) void auth.fetchAccount()
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

.topbar__start {
  display: flex;
  align-items: center;
  gap: 8px;
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

.topbar__logo {
  font-size: 17px;
  font-weight: 900;
  color: var(--accent);
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
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 12px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 20%, transparent), color-mix(in srgb, var(--accent) 8%, transparent));
  border: 1px solid var(--accent);
  color: var(--accent);
  font-size: 12px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  transition: all 0.2s ease;
}

.topbar__wallet:hover {
  background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 25%, transparent), color-mix(in srgb, var(--accent) 12%, transparent));
  border-color: var(--accent-light);
}

.topbar__wallet i {
  font-size: 16px;
  display: flex;
  align-items: center;
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
  /* 4 tabs signed-in, 5 for guests (public بازار + gated tabs) — auto-fit
     keeps every tab equal-width in both states. */
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
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

/* Locked tabs: dimmed, with a lock badge on the icon. */
.tab--gate {
  opacity: 0.75;
}

.tab--gate .tab__icon {
  position: relative;
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

