<template>
  <div class="page">
    <div class="auth">
      <h1 class="auth__title">{{ auth.isLoggedIn ? 'حساب کاربری' : 'ورود به حساب' }}</h1>

      <template v-if="auth.isLoggedIn">
        <div class="account">
          <div class="account__row">
            <span class="account__label">شماره / ایمیل</span>
            <span class="account__value">{{ auth.user?.email || auth.user?.phone || '—' }}</span>
          </div>
          <div class="account__row">
            <span class="account__label">موجودی کیف پول</span>
            <span class="account__value">{{ faMoney(auth.balance) }}</span>
          </div>
          <div class="account__row">
            <span class="account__label">ارزش کل دارایی</span>
            <span class="account__value">{{ faMoney(auth.equity) }}</span>
          </div>
        </div>

        <section class="deposit">
          <label class="deposit__label">
            <span>افزایش موجودی آزمایشی</span>
            <div class="deposit__input">
              <input v-model="amount" type="text" inputmode="numeric" placeholder="۰" />
            </div>
          </label>
          <div class="deposit__quick">
            <button v-for="q in [1_000_000, 10_000_000, 50_000_000]" :key="q" type="button" class="chip" @click="amount = String(q)">
              {{ faMoney(q) }}
            </button>
          </div>
          <button type="button" class="btn btn--primary btn--block" :disabled="depositing" @click="doDeposit">
            {{ depositing ? 'در حال ثبت…' : 'افزایش موجودی' }}
          </button>
          <p v-if="depositMsg" class="deposit__msg" :class="depositOk ? 'is-ok' : 'is-err'">{{ depositMsg }}</p>
        </section>

        <button type="button" class="logout" @click="logout">خروج از حساب</button>
      </template>

      <template v-else>
        <div class="filters" role="tablist" style="display:flex;gap:6px;margin-bottom:12px">
          <button type="button" class="chip" :class="{ 'chip--on': mode === 'login' }" @click="mode = 'login'">ورود</button>
          <button type="button" class="chip" :class="{ 'chip--on': mode === 'register' }" @click="mode = 'register'">ثبت‌نام</button>
        </div>
        <form class="form" @submit.prevent="submit">
          <label class="form__field">
            <span>شماره موبایل</span>
            <input v-model="phone" type="text" inputmode="tel" autocomplete="username" placeholder="۰۹۱۲۳۴۵۶۷۸۹" />
          </label>
          <label class="form__field">
            <span>رمز عبور</span>
            <input v-model="password" type="password" autocomplete="current-password" placeholder="••••••" />
          </label>
          <template v-if="mode === 'register'">
            <label class="form__field">
              <span>نام</span>
              <input v-model="name" type="text" autocomplete="name" placeholder="نام و نام خانوادگی" />
            </label>
            <label class="form__field">
              <span>کد ملی (اختیاری)</span>
              <input v-model="nationalId" type="text" inputmode="numeric" placeholder="۰۰۱۲۳۴۵۶۷۸" />
            </label>
          </template>

          <p v-if="auth.error" class="form__error">{{ auth.error }}</p>

          <button type="submit" class="btn btn--primary btn--block" :disabled="auth.loading">
            {{ auth.loading ? (mode === 'register' ? 'در حال ثبت‌نام…' : 'در حال ورود…') : (mode === 'register' ? 'ثبت‌نام' : 'ورود') }}
          </button>
        </form>
        <p class="form__hint">
          همین نام کاربری و رمز عبور سایت دلی گلد را وارد کنید.
        </p>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { faMoney } from '../utils/format'

const auth = useAuthStore()
const router = useRouter()

const mode = ref('login')
const phone = ref('')
const password = ref('')
const name = ref('')
const nationalId = ref('')
const amount = ref('1000000')
const depositing = ref(false)
const depositMsg = ref('')
const depositOk = ref(false)

async function submit() {
  const ok = mode.value === 'register'
    ? await auth.register(phone.value.trim(), password.value, name.value.trim(), nationalId.value.trim())
    : await auth.login(phone.value.trim(), password.value)
  if (ok) {
    password.value = ''
    // A guarded route that bounced us here takes priority; otherwise send the
    // user to their role's home (staff → /review, customer → board).
    const redirect = router.currentRoute.value.query.redirect
    router.push(typeof redirect === 'string' && redirect.startsWith('/') ? redirect : auth.homeRoute)
  }
}

async function doDeposit() {
  const value = Number(String(amount.value).replace(/[^\d]/g, ''))
  if (!value) return
  depositing.value = true
  depositMsg.value = ''
  try {
    await auth.deposit(value)
    depositMsg.value = 'موجودی با موفقیت افزایش یافت.'
    depositOk.value = true
  } catch (e) {
    depositMsg.value = e.message || 'افزایش موجودی ناموفق بود'
    depositOk.value = false
  } finally {
    depositing.value = false
  }
}

function logout() {
  auth.logout()
  router.push('/login')
}
</script>

<style scoped>
.page {
  max-width: 460px;
  margin: 0 auto;
  padding: 24px 14px 28px;
}

.auth__title {
  margin: 0 0 16px;
  font-size: 20px;
  font-weight: 900;
  color: var(--accent);
}

.account {
  display: flex;
  flex-direction: column;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--card);
  overflow: hidden;
}

.account__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 13px 14px;
  font-size: 13px;
  border-bottom: 1px solid var(--border);
}

.account__row:last-child {
  border-bottom: none;
}

.account__label {
  color: var(--text-muted);
}

.account__value {
  font-weight: 800;
}

.deposit {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 18px;
  padding: 14px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--card);
}

.deposit__label {
  display: flex;
  flex-direction: column;
  gap: 7px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-muted);
}

.deposit__input input {
  width: 100%;
  padding: 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 18px;
  font-weight: 800;
  text-align: center;
  outline: none;
}

.deposit__input input:focus {
  border-color: var(--accent);
}

.deposit__quick {
  display: flex;
  gap: 6px;
}

.chip {
  flex: 1;
  padding: 8px 0;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-muted);
  font-size: 11.5px;
  font-weight: 700;
}

.deposit__msg {
  margin: 0;
  padding: 9px 11px;
  border-radius: var(--radius-sm);
  font-size: 12.5px;
  font-weight: 600;
}

.deposit__msg.is-ok {
  background: var(--up-soft);
  color: var(--up);
}

.deposit__msg.is-err {
  background: var(--down-soft);
  color: var(--down);
}

.logout {
  width: 100%;
  margin-top: 18px;
  padding: 12px 0;
  border-radius: 12px;
  border: 1px solid var(--down);
  color: var(--down);
  font-size: 14px;
  font-weight: 800;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form__field {
  display: flex;
  flex-direction: column;
  gap: 7px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-muted);
}

.form__field input {
  padding: 13px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--text);
  font-size: 16px;
  font-weight: 700;
  outline: none;
}

.form__field input:focus {
  border-color: var(--accent);
}

.form__error {
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--down-soft);
  color: var(--down);
  font-size: 12.5px;
  font-weight: 600;
}

.form__hint {
  margin: 16px 0 0;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--text-muted);
  text-align: center;
}

.btn--primary {
  padding: 14px 18px;
  border-radius: 12px;
  background: var(--accent);
  color: #fff;
  font-size: 15px;
  font-weight: 800;
}

.btn--block {
  width: 100%;
}
</style>

