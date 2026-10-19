<template>
  <transition name="drawer">
    <div v-if="open" class="drawer" role="dialog" aria-label="منو">
      <div class="drawer__scrim" @click="emit('close')"></div>

      <aside class="drawer__panel">
        <header class="drawer__head">
          <button type="button" class="drawer__collapse" @click="emit('close')">
            <i class="material-icons">chevron_right</i>
          </button>
          <strong class="drawer__brand">دلی گلد</strong>
          <i class="drawer__logo material-icons">diamond</i>
        </header>

        <div class="drawer__profile">
          <i class="drawer__avatar material-icons">account_circle</i>
          <div class="drawer__who">
            <template v-if="auth.isLoggedIn">
              <b>{{ auth.user?.name || 'کاربر دلی گلد' }}</b>
              <small class="is-live">● فعال</small>
            </template>
            <template v-else>
              <b>مهمان</b>
              <small>وارد نشده‌اید</small>
            </template>
          </div>
          <button type="button" class="drawer__theme" :title="isDark ? 'حالت روشن' : 'حالت تیره'" @click="toggleTheme">
            <i class="material-icons">{{ isDark ? 'light_mode' : 'dark_mode' }}</i>
          </button>
        </div>

        <nav class="drawer__nav">
          <button type="button" class="drawer__item" @click="go('/')">
            <i class="material-icons">home</i> خانه
          </button>
          <button type="button" class="drawer__item" @click="go('/markets')">
            <i class="material-icons">storefront</i> بازار
          </button>

          <!-- Account area: signed-in only. Guests just see the login CTA. -->
          <template v-if="auth.isLoggedIn">
            <button type="button" class="drawer__item" @click="go('/trade')">
              <i class="material-icons">show_chart</i> معاملات
            </button>
            <button type="button" class="drawer__item" @click="go('/portfolio')">
              <i class="material-icons">work</i> سبد من
            </button>
            <button type="button" class="drawer__item" @click="go('/history')">
              <i class="material-icons">history</i> تاریخچه معاملات
            </button>
            <button type="button" class="drawer__item" @click="go('/account')">
              <i class="material-icons">account_balance_wallet</i> مانده حساب
            </button>
            <button type="button" class="drawer__item" @click="go('/wallet')">
              <i class="material-icons">savings</i> کیف پول
            </button>
          </template>

          <!-- Customers and guests join a broker by scanning its invite QR. -->
          <button v-if="!auth.isStaff" type="button" class="drawer__item" @click="go('/join')">
            <i class="material-icons">qr_code_scanner</i> پیوستن به کارگزاری
          </button>

          <!-- A customer who joined a broker can browse its shopfront. -->
          <button v-if="auth.isLoggedIn && auth.user?.brokerId && !auth.isStaff" type="button" class="drawer__item" @click="go('/store')">
            <i class="material-icons">storefront</i> فروشگاه
          </button>

          <button type="button" class="drawer__item" @click="go('/settings')">
            <i class="material-icons">settings</i> تنظیمات
          </button>
          <button type="button" class="drawer__item" @click="showTerms = true">
            <i class="material-icons">policy</i> شرایط و قوانین
          </button>

          <template v-if="auth.isStaff">
            <div class="drawer__divider" />
            <div class="drawer__group">
              <span class="drawer__group-title">مدیریت</span>
              <small v-if="roleLabel" class="drawer__role">{{ roleLabel }}</small>
            </div>
            <button type="button" class="drawer__item" @click="go('/review')">
              <i class="material-icons">fact_check</i> صف بررسی
            </button>
            <button type="button" class="drawer__item" @click="go('/customers')">
              <i class="material-icons">groups</i> مشتریان
            </button>
            <button type="button" class="drawer__item" @click="go('/desk')">
              <i class="material-icons">support_agent</i> میز کارگزاری
            </button>
            <button v-if="auth.canViewStores" type="button" class="drawer__item" @click="go('/stores')">
              <i class="material-icons">storefront</i> فروشگاه‌ها
            </button>
            <button v-if="auth.isBrokerManager || auth.isBrokerAdmin || auth.isSuperAdmin" type="button" class="drawer__item" @click="go('/store-setup')">
              <i class="material-icons">store</i> تنظیمات فروشگاه
            </button>
            <button v-if="auth.canViewReports" type="button" class="drawer__item" @click="go('/reports')">
              <i class="material-icons">assessment</i> گزارش‌ها
            </button>
            <button v-if="auth.isSuperAdmin" type="button" class="drawer__item" @click="go('/users')">
              <i class="material-icons">group</i> کاربران
            </button>
          </template>

          <button v-if="auth.isLoggedIn" type="button" class="drawer__item drawer__item--out" @click="logout">
            <i class="material-icons">logout</i> خروج از حساب
          </button>
          <button v-else type="button" class="drawer__item drawer__item--cta" @click="emit('close'); openLogin('login')">
            <i class="material-icons">login</i> ورود / ثبت‌نام
          </button>
        </nav>

        <footer class="drawer__foot">نسخه ۱٫۰٫۰</footer>
      </aside>

      <TermsModal v-if="showTerms" @close="showTerms = false" />
    </div>
  </transition>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { ROLE_LABELS } from '../utils/roles'
import TermsModal from './TermsModal.vue'
import { applyPalette, loadPaletteId, savePaletteId, DEFAULT_PALETTE_ID } from '../theme'

defineProps({ open: Boolean })
const emit = defineEmits(['close'])

const router = useRouter()
const auth = useAuthStore()
const showTerms = ref(false)
const isDark = ref(loadPaletteId() !== 'light' && loadPaletteId() !== 'cream-light')
const roleLabel = computed(() => ROLE_LABELS[auth.role] ?? '')

function go(path) {
  emit('close')
  router.push(path)
}

function logout() {
  auth.logout()
  emit('close')
  router.push('/')
}

/** Moon button flips between the light default and the classic dark palette. */
function toggleTheme() {
  const next = isDark.value ? DEFAULT_PALETTE_ID : 'gold-dark'
  savePaletteId(next)
  applyPalette(next)
  isDark.value = !isDark.value
}
</script>

<style scoped>
.drawer {
  position: fixed;
  inset: 0;
  z-index: 70;
}

.drawer__scrim {
  position: absolute;
  inset: 0;
  background: rgba(10, 12, 16, 0.5);
}

.drawer__panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(78vw, 320px);
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border);
  box-shadow: -14px 0 40px rgba(0, 0, 0, 0.25);
  padding-bottom: env(safe-area-inset-bottom);
}

.drawer__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 14px 12px;
  border-bottom: 1px solid var(--border);
}

.drawer__collapse {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: var(--text-muted);
}

.drawer__brand {
  flex: 1;
  font-size: 16px;
  font-weight: 900;
}

.drawer__logo {
  font-size: 19px;
  color: var(--accent);
}

.drawer__profile {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px;
  border-bottom: 1px solid var(--border);
}

.drawer__avatar {
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: 40px;
  color: var(--text-muted);
}

.drawer__who {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.drawer__who b {
  font-size: 13.5px;
}

.drawer__who small {
  font-size: 11px;
  color: var(--text-muted);
}

.drawer__who small.is-live {
  color: var(--up);
}

.drawer__theme {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-muted);
}

.drawer__nav {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.drawer__item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 13px 12px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  text-align: right;
}

.drawer__item:active {
  background: var(--surface);
}

.drawer__item .material-icons {
  font-size: 21px;
  color: var(--text-muted);
}

.drawer__item--out {
  color: var(--down);
}

/* Guest primary CTA — the only way in for signed-out users. */
.drawer__item--cta {
  margin-top: 6px;
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  border: 1px solid var(--accent);
  color: var(--accent);
}

.drawer__divider {
  height: 1px;
  margin: 8px 6px;
  background: var(--border);
}

.drawer__group {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 12px 2px;
}

.drawer__group-title {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--text-muted);
}

.drawer__role {
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 15%, var(--card));
  color: var(--accent);
  font-size: 10px;
  font-weight: 800;
}

.drawer__foot {
  padding: 12px;
  text-align: center;
  font-size: 11px;
  color: var(--text-muted);
  border-top: 1px solid var(--border);
}

.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.18s ease;
}

.drawer-enter-active .drawer__panel,
.drawer-leave-active .drawer__panel {
  transition: transform 0.22s ease;
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}

.drawer-enter-from .drawer__panel,
.drawer-leave-to .drawer__panel {
  transform: translateX(100%);
}
</style>

