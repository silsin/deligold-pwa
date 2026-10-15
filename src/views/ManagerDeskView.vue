<template>
  <div class="page">
    <header class="head">
      <div>
        <h1 class="title">میز کارگزاری</h1>
        <p class="sub">مشتریان و تأییدهای نقدی (ویژه مدیر کارگزاری)</p>
      </div>
      <button type="button" class="icon-btn material-icons" :disabled="auth.loading" title="بازآوری" @click="reload">refresh</button>
    </header>

    <div v-if="!auth.isLoggedIn" class="empty">
      <p class="empty__text">برای مدیریت، ابتدا وارد شوید</p>
      <button type="button" class="btn btn--primary" @click="openLogin('login')">ورود</button>
    </div>

    <template v-else>
      <p v-if="auth.error" class="alert" role="alert">{{ auth.error }}</p>

      <div class="tabs" role="tablist">
        <button type="button" class="tab" :class="{ 'is-on': tab === 'customers' }" role="tab" @click="tab = 'customers'">
          مشتریان<span v-if="pendingCount" class="count">{{ toFa(pendingCount) }}</span>
        </button>
        <button type="button" class="tab" :class="{ 'is-on': tab === 'cash' }" role="tab" @click="tab = 'cash'">
          نقدی<span v-if="cashCount" class="count">{{ toFa(cashCount) }}</span>
        </button>
        <button type="button" class="tab" :class="{ 'is-on': tab === 'prices' }" role="tab" @click="openPrices">
          قیمت‌ها
        </button>
      </div>

      <!-- ── Customers ── -->
      <template v-if="tab === 'customers'">
        <form class="filters" @submit.prevent="loadCustomers">
          <input v-model="search" class="field__input" type="search" placeholder="جست‌وجو: نام یا موبایل…" />
          <select v-model="verifiedFilter" class="field__input">
            <option value="">همه</option>
            <option value="pending">در انتظار تأیید</option>
            <option value="verified">تأییدشده</option>
          </select>
          <button type="submit" class="btn btn--primary" :disabled="auth.loading">جست‌وجو</button>
        </form>

        <div v-if="auth.loading && !customerRows.length" class="empty empty--inline"><p class="empty__text">در حال دریافت…</p></div>
        <div v-else-if="!customerRows.length" class="empty empty--inline"><p class="empty__text">مشتری‌ای یافت نشد</p></div>
        <ul v-else class="cards">
          <li v-for="u in customerRows" :key="u.id" class="card">
            <div class="card__top">
              <div class="who"><b>{{ u.name || '—' }}</b><small class="tnum" dir="ltr">{{ u.phone || 'بدون موبایل' }}</small></div>
              <span class="badge" :class="u.verified ? 'is-ok' : 'is-warn'">{{ u.verified ? '✓ تأییدشده' : 'در انتظار' }}</span>
            </div>
            <div v-if="u.verifyNote" class="note">دلیل رد قبلی: {{ u.verifyNote }}</div>
            <div class="card__meta muted tnum">id: {{ shortId(u.id) }}</div>
            <input v-model="verifyNotes[u.id]" class="field__input field__input--sm" type="text" maxlength="300" placeholder="یادداشت (برای رد، دلیل بنویسید)" />
            <div class="actions">
              <button v-if="!u.verified" type="button" class="btn btn--primary btn--sm" :disabled="auth.loading" @click="verify(u, true)">تأیید هویت</button>
              <button v-else type="button" class="btn btn--sm" :disabled="auth.loading" @click="verify(u, false)">لغو تأیید</button>
              <button type="button" class="btn btn--sm btn--danger" :disabled="auth.loading" @click="block(u)">مسدود</button>
              <button type="button" class="btn btn--sm" :disabled="auth.loading" @click="unblock(u)">رفع مسدودی</button>
            </div>
          </li>
        </ul>
      </template>

      <!-- ── Cash approvals ── -->
      <template v-else-if="tab === 'cash'">
        <section class="card">
          <header class="card__head"><span><i class="material-icons">savings</i> واریزها</span>
            <span v-if="deposits.length" class="count">{{ toFa(deposits.length) }}</span>
          </header>
          <div v-if="!deposits.length" class="muted">واریز در انتظاری نیست.</div>
          <ul v-else class="cards cards--flat">
            <li v-for="d in deposits" :key="d.id" class="cash">
              <div class="card__top">
                <b class="tnum">{{ faMoney(d.amount ?? d.total ?? 0) }}</b>
                <small class="muted">{{ d.method || '' }} · {{ shortId(d.id) }}</small>
              </div>
              <div v-if="d.reference" class="note tnum">پیگیری: {{ d.reference }}</div>
              <div class="actions">
                <button type="button" class="btn btn--primary btn--sm" :disabled="auth.loading" @click="decide('deposit', d.id, true)">تأیید واریز</button>
                <button type="button" class="btn btn--sm" :disabled="auth.loading" @click="decide('deposit', d.id, false)">رد</button>
              </div>
            </li>
          </ul>
        </section>

        <section class="card">
          <header class="card__head"><span><i class="material-icons">payments</i> برداشت‌ها</span>
            <span v-if="withdrawals.length" class="count">{{ toFa(withdrawals.length) }}</span>
          </header>
          <div v-if="!withdrawals.length" class="muted">برداشت در انتظاری نیست.</div>
          <ul v-else class="cards cards--flat">
            <li v-for="w in withdrawals" :key="w.id" class="cash">
              <div class="card__top">
                <b class="tnum">{{ faMoney(w.amount ?? w.total ?? 0) }}</b>
                <small class="muted">{{ shortId(w.id) }}</small>
              </div>
              <div v-if="w.destination" class="note">مقصد: {{ w.destination }}</div>
              <div class="actions">
                <button type="button" class="btn btn--primary btn--sm" :disabled="auth.loading" @click="decide('withdrawal', w.id, true)">ثبت پرداخت</button>
                <button type="button" class="btn btn--sm" :disabled="auth.loading" @click="decide('withdrawal', w.id, false)">رد و استرداد</button>
              </div>
            </li>
          </ul>
        </section>
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { ROLES } from '../utils/roles'
import { faMoney, toFa } from '../utils/format'

const auth = useAuthStore()

const tab = ref('customers')
const search = ref('')
const verifiedFilter = ref('')
const verifyNotes = reactive({})

const shortId = id => String(id ?? '').slice(0, 8)

// The directory may hold staff rows too (super-admin sees all) — the desk
// shows customers only; staff management lives on the users screen.
const customerRows = computed(() =>
  auth.directory.filter(u => (u?.role ?? ROLES.CUSTOMER) === ROLES.CUSTOMER)
)

const pendingCount = computed(() => customerRows.value.filter(u => !u.verified).length)
const deposits = computed(() => auth.cashPending.deposits ?? [])
const withdrawals = computed(() => auth.cashPending.withdrawals ?? [])
const cashCount = computed(() => deposits.value.length + withdrawals.value.length)

async function loadCustomers() {
  const params = { search: search.value.trim(), limit: 100 }
  if (verifiedFilter.value === 'verified') params.verified = true
  if (verifiedFilter.value === 'pending') params.verified = false
  await auth.fetchDirectory(params)
}

async function reload() {
  if (tab.value === 'customers') await loadCustomers()
  else await auth.fetchCashPending()
}

async function verify(u, ok) {
  const { ok: done } = await auth.setCustomerVerified(u.id, ok, verifyNotes[u.id] || '')
  if (done) {
    verifyNotes[u.id] = ''
    await loadCustomers()
  }
}

async function block(u) {
  const { ok: done } = await auth.setCustomerStatus(u.id, 'SUSPENDED')
  if (done) await loadCustomers()
}

async function unblock(u) {
  const { ok: done } = await auth.setCustomerStatus(u.id, 'ACTIVE')
  if (done) await loadCustomers()
}

async function decide(kind, id, approve) {
  const { ok: done } = await auth.decideCash(kind, id, approve)
  if (done) await auth.fetchCashPending()
}

onMounted(async () => {
  if (!auth.isLoggedIn) return
  await Promise.all([loadCustomers(), auth.fetchCashPending()])
})
</script>

<style scoped>
.page { max-width: 720px; margin: 0 auto; padding: 16px 14px 30px; display: flex; flex-direction: column; gap: 12px; }
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.title { margin: 0; font-size: 19px; font-weight: 900; }
.sub { margin: 4px 0 0; font-size: 12px; color: var(--text-muted); }
.icon-btn { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 10px; background: var(--surface); border: 1px solid var(--border); color: var(--text-muted); }
.alert { margin: 0; padding: 10px 13px; border-radius: 12px; background: var(--down-soft); color: var(--down); font-size: 12.5px; }
.tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; border-radius: 12px; background: var(--surface); }
.tab { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 0; border-radius: 9px; font-size: 13.5px; font-weight: 800; color: var(--text-muted); }
.tab.is-on { background: var(--accent); color: #14100a; }
.count { min-width: 22px; padding: 1px 7px; border-radius: 999px; background: var(--down); color: #fff; font-size: 11px; font-weight: 900; }
.tab.is-on .count { background: rgba(0, 0, 0, 0.25); }
.filters { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; }
.field__input { width: 100%; padding: 11px 13px; border-radius: 11px; border: 1px solid var(--border); background: var(--card); color: var(--text); font: inherit; font-size: 13.5px; }
.field__input--sm { padding: 9px 11px; font-size: 12.5px; }
.btn { padding: 11px 18px; border-radius: 11px; border: 1px solid var(--border); background: var(--surface); font-size: 13.5px; font-weight: 800; white-space: nowrap; }
.btn--primary { background: var(--accent); border-color: var(--accent); color: #14100a; }
.btn--sm { padding: 9px 14px; font-size: 12.5px; }
.btn--danger { color: var(--down); border-color: var(--down); }
.btn:disabled { opacity: 0.55; }
.cards { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.cards--flat { margin-top: 10px; }
.card { padding: 13px 14px; border-radius: 14px; background: var(--card); border: 1px solid var(--border); display: flex; flex-direction: column; gap: 10px; }
.card__head { display: flex; align-items: center; justify-content: space-between; font-size: 13.5px; font-weight: 800; }
.card__head .material-icons { vertical-align: -5px; margin-left: 5px; font-size: 19px; color: var(--accent); }
.card__top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.who { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.who b { font-size: 14px; }
.who small { font-size: 11.5px; color: var(--text-muted); }
.card__meta { font-size: 11px; }
.badge { padding: 3px 10px; border-radius: 999px; background: var(--surface); border: 1px solid var(--border); font-size: 11px; font-weight: 800; white-space: nowrap; }
.badge.is-ok { background: var(--up-soft); color: var(--up); border-color: var(--up); }
.badge.is-warn { background: color-mix(in srgb, var(--accent) 15%, var(--card)); color: var(--accent); border-color: var(--accent); }
.note { font-size: 12px; color: var(--text-muted); line-height: 1.8; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.muted { color: var(--text-muted); font-size: 12.5px; text-align: center; padding: 8px 0; }
.cash { display: flex; flex-direction: column; gap: 8px; padding: 11px 12px; border-radius: 12px; background: var(--surface); border: 1px solid var(--border); }
.cash .card__top b { font-size: 14.5px; }
.cash .card__top small { font-size: 11px; }
.empty { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 32px 18px; border-radius: var(--radius); border: 1px dashed var(--border); text-align: center; }
.empty--inline { padding: 30px 0; }
.empty__text { margin: 0; font-size: 13px; color: var(--text-muted); }
@media (max-width: 560px) {
  .filters { grid-template-columns: 1fr; }
}
</style>