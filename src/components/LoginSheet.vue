<template>
  <transition name="sheet">
    <div v-if="authGate.open" class="sheet" role="dialog" aria-modal="true" aria-label="ورود به حساب">
      <div class="sheet__scrim" @click="close"></div>

      <section class="sheet__panel" @click.stop>
        <span class="sheet__grip" aria-hidden="true"></span>

        <header class="sheet__head">
          <h2 class="sheet__title">دلی گلد</h2>
          <button type="button" class="sheet__close material-icons" aria-label="بستن" @click="close">close</button>
        </header>

        <div class="sheet__tabs" role="tablist">
          <button
            type="button"
            class="sheet__tab"
            :class="{ 'is-on': authGate.mode === 'login' }"
            role="tab"
            :aria-selected="authGate.mode === 'login'"
            @click="switchTab('login')"
          >
            ورود
          </button>
          <button
            type="button"
            class="sheet__tab"
            :class="{ 'is-on': authGate.mode === 'register' }"
            role="tab"
            :aria-selected="authGate.mode === 'register'"
            @click="switchTab('register')"
          >
            ثبت‌نام
          </button>
        </div>

        <form class="sheet__form" @submit.prevent="submit">
          <label class="sheet__field">
            <span>شماره موبایل</span>
            <input v-model="phone" type="text" inputmode="tel" autocomplete="username" placeholder="۰۹۱۲۳۴۵۶۷۸۹" />
          </label>

          <label class="sheet__field">
            <span>رمز عبور</span>
            <input v-model="password" type="password" autocomplete="current-password" placeholder="••••••" />
          </label>

          <template v-if="authGate.mode === 'register'">
            <div
              v-if="authGate.pendingInvite"
              class="sheet__invite"
              :class="{ 'is-bad': !authGate.pendingInvite.valid }"
              role="status"
            >
              <span class="material-icons">{{ authGate.pendingInvite.valid ? 'how_to_reg' : 'link_off' }}</span>
              <span v-if="authGate.pendingInvite.valid">
                دعوت‌نامه از <b>{{ authGate.pendingInvite.brokerName || 'کارگزاری' }}</b>
              </span>
              <span v-else>{{ authGate.pendingInvite.reason }} — ثبت‌نام بدون دعوت‌نامه انجام می‌شود.</span>
            </div>
            <label class="sheet__field">
              <span>کد ملی</span>
              <input v-model="nationalId" type="text" inputmode="numeric" placeholder="۰۰۱۲۳۴۵۶۷۸" required />
            </label>
            <label class="sheet__field">
              <span>نام و نام خانوادگی</span>
              <input v-model="name" type="text" autocomplete="name" placeholder="نام و نام خانوادگی" required />
            </label>
          </template>

          <button
            v-if="authGate.mode === 'register' && !authGate.pendingInvite"
            type="button"
            class="sheet__scan"
            @click="scanInvite"
          >
            <span class="material-icons">qr_code_scanner</span> کد دعوت کارگزاری دارید؟ اسکن کنید
          </button>

          <p v-if="auth.error" class="sheet__error" role="alert">{{ auth.error }}</p>

          <button type="submit" class="sheet__submit" :disabled="auth.loading">
            {{
              auth.loading
                ? authGate.mode === 'register'
                  ? 'در حال ثبت‌نام…'
                  : 'در حال ورود…'
                : authGate.mode === 'register'
                  ? 'ثبت‌نام'
                  : 'ورود'
            }}
          </button>
        </form>

 
        <div class="sheet__safe">
          <span class="material-icons">shield</span>
          معاملات شما از درگاه امن انجام می‌شود
        </div>
      </section>
    </div>
  </transition>
</template>

<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { authGate, closeLogin, consumeReturnTo } from '../utils/authGate'

const auth = useAuthStore()
const router = useRouter()

const phone = ref('')
const password = ref('')
const name = ref('')
const nationalId = ref('')

function close() {
  closeLogin()
  auth.error = ''
}

function switchTab(mode) {
  authGate.mode = mode
  auth.error = ''
}

// Escape closes the sheet — standard dialog behaviour, and the only keyboard
// way out now that the scrim is the only other dismiss affordance.
function onKeydown(e) {
  if (e.key === 'Escape' && authGate.open) close()
}

// Start every session on a clean form so a half-typed sign-up never bleeds
// into a later login attempt.
watch(
  () => authGate.open,
  isOpen => {
    if (!isOpen) return
    auth.error = ''
    phone.value = ''
    password.value = ''
    name.value = ''
    nationalId.value = ''
    if (typeof window !== 'undefined') window.addEventListener('keydown', onKeydown)
  }
)

// Clear the error whenever the user switches between login and register tabs
// so a failed login message never bleeds into the register form.
// NOTE: the tab buttons also call switchTab() which clears immediately — this
// watch is a belt-and-suspenders fallback for any programmatic mode changes.
watch(
  () => authGate.mode,
  () => { auth.error = '' }
)

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onKeydown)
})

// Hand off to the scanner screen; it brings the guest back here with the invite.
function scanInvite() {
  closeLogin()
  auth.error = ''
  router.push('/join')
}

async function submit() {
  const ok =
    authGate.mode === 'register'
      ? await auth.register(
          phone.value.trim(),
          password.value,
          name.value.trim(),
          nationalId.value.trim(),
          authGate.pendingInvite?.valid ? authGate.pendingInvite.code : undefined
        )
      : await auth.login(phone.value.trim(), password.value)

  if (!ok) return

  // Land the guest back on whatever they were trying to open, else the board.
  const target = consumeReturnTo()
  password.value = ''
  closeLogin()
  await router.push(target && target !== '/' ? target : '/')
}
</script>

<style scoped>
.sheet {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet__scrim {
  position: absolute;
  inset: 0;
  background: rgba(6, 8, 12, 0.66);
  backdrop-filter: blur(2px);
}

.sheet__panel {
  position: relative;
  width: 100%;
  max-width: 520px;
  max-height: 92dvh;
  overflow-y: auto;
  padding: 8px 18px calc(22px + env(safe-area-inset-bottom));
  border-radius: 22px 22px 0 0;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-bottom: none;
  box-shadow: 0 -18px 46px rgba(0, 0, 0, 0.45);
}

.sheet__grip {
  display: block;
  width: 44px;
  height: 4px;
  margin: 4px auto 12px;
  border-radius: 999px;
  background: var(--border);
}

.sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.sheet__title {
  margin: 0;
  font-size: 19px;
  font-weight: 900;
  color: var(--accent);
}

.sheet__close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: var(--surface);
  color: var(--text-muted);
  font-size: 18px;
}

.sheet__tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin: 14px 0 16px;
  padding: 4px;
  border-radius: 12px;
  background: var(--surface);
}

.sheet__tab {
  padding: 9px 0;
  border-radius: 9px;
  font-size: 13.5px;
  font-weight: 800;
  color: var(--text-muted);
  transition: background 0.15s ease, color 0.15s ease;
}

.sheet__tab.is-on {
  background: var(--accent);
  color: #14100a;
}

.sheet__form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sheet__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
}

.sheet__field input {
  padding: 12px 13px;
  border-radius: 11px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--text);
  font: inherit;
  font-size: 14px;
}

.sheet__field input:focus {
  outline: none;
  border-color: var(--accent);
}

.sheet__invite {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, var(--card));
  color: var(--text);
  font-size: 12.5px;
  line-height: 1.7;
}

.sheet__invite .material-icons {
  font-size: 20px;
  color: var(--accent);
}

.sheet__invite.is-bad {
  border-color: var(--down);
  background: var(--down-soft);
}

.sheet__invite.is-bad .material-icons {
  color: var(--down);
}

.sheet__scan {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 12px;
  border-radius: 12px;
  border: 1px dashed var(--accent);
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-size: 12.5px;
  font-weight: 800;
  cursor: pointer;
}

.sheet__scan .material-icons {
  font-size: 19px;
}

.sheet__error {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--down-soft);
  color: var(--down);
  font-size: 12.5px;
  font-weight: 700;
}

.sheet__submit {
  margin-top: 4px;
  padding: 13px;
  border-radius: 12px;
  background: var(--accent);
  color: #14100a;
  font-size: 15px;
  font-weight: 900;
}

.sheet__submit:disabled {
  opacity: 0.6;
}

.sheet__hint {
  margin: 14px 0 0;
  font-size: 11.5px;
  line-height: 1.7;
  text-align: center;
  color: var(--text-muted);
}

.sheet__safe {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-muted);
}

.sheet__safe .material-icons {
  font-size: 14px;
  color: var(--up);
}

.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.2s ease;
}

.sheet-enter-active .sheet__panel,
.sheet-leave-active .sheet__panel {
  transition: transform 0.26s cubic-bezier(0.22, 0.68, 0.36, 1);
}

.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}

.sheet-enter-from .sheet__panel,
.sheet-leave-to .sheet__panel {
  transform: translateY(100%);
}
</style>