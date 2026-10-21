<template>
  <div class="page">

    <!-- ── Header ──────────────────────────────────────────────────────────── -->
    <header class="head">
      <div class="head__text">
        <h1 class="title">میز کارگزاری</h1>
        <p class="sub">مدیریت مشتریان و تأییدهای مالی</p>
      </div>
      <button
        type="button"
        class="icon-btn material-icons"
        :class="{ 'is-spinning': auth.loading }"
        :disabled="auth.loading"
        title="بازآوری"
        @click="reload"
      >refresh</button>
    </header>

    <!-- ── Not logged in ───────────────────────────────────────────────────── -->
    <div v-if="!auth.isLoggedIn" class="empty">
      <i class="material-icons empty__icon">manage_accounts</i>
      <p class="empty__text">برای مدیریت، ابتدا وارد شوید</p>
      <button type="button" class="btn btn--primary" @click="openLogin('login')">
        <i class="material-icons">login</i> ورود به حساب
      </button>
    </div>

    <template v-else>
      <p v-if="auth.error" class="alert" role="alert">
        <i class="material-icons">error_outline</i> {{ auth.error }}
      </p>

      <!-- ── Summary strip ─────────────────────────────────────────────────── -->
      <div class="stats">
        <div class="stat">
          <i class="material-icons stat__icon">group</i>
          <div class="stat__body">
            <span class="stat__value tnum">{{ toFa(customerRows.length) }}</span>
            <span class="stat__label">مشتریان</span>
          </div>
        </div>
        <div class="stat stat--warn">
          <i class="material-icons stat__icon">pending_actions</i>
          <div class="stat__body">
            <span class="stat__value tnum">{{ toFa(pendingCount) }}</span>
            <span class="stat__label">در انتظار تأیید</span>
          </div>
        </div>
        <div class="stat stat--accent">
          <i class="material-icons stat__icon">account_balance_wallet</i>
          <div class="stat__body">
            <span class="stat__value tnum">{{ toFa(cashCount) }}</span>
            <span class="stat__label">تراکنش نقدی</span>
          </div>
        </div>
      </div>

      <!-- ── Tab bar ────────────────────────────────────────────────────────── -->
      <div class="tabs" role="tablist">
        <button
          type="button"
          class="tab"
          :class="{ 'is-on': tab === 'customers' }"
          role="tab"
          @click="tab = 'customers'"
        >
          <i class="material-icons">group</i>
          مشتریان
          <span v-if="pendingCount" class="tab__badge">{{ toFa(pendingCount) }}</span>
        </button>
        <button
          type="button"
          class="tab"
          :class="{ 'is-on': tab === 'cash' }"
          role="tab"
          @click="tab = 'cash'"
        >
          <i class="material-icons">payments</i>
          نقدی
          <span v-if="cashCount" class="tab__badge">{{ toFa(cashCount) }}</span>
        </button>
        <button
          type="button"
          class="tab"
          :class="{ 'is-on': tab === 'prices' }"
          role="tab"
          @click="openPrices"
        >
          <i class="material-icons">trending_up</i>
          قیمت‌ها
        </button>
      </div>

      <!-- ════════════════════════════════════════════════════════════════════ -->
      <!-- Tab: customers                                                       -->
      <!-- ════════════════════════════════════════════════════════════════════ -->
      <template v-if="tab === 'customers'">

        <form class="filters" @submit.prevent="loadCustomers">
          <div class="filters__input-wrap">
            <i class="material-icons filters__icon">search</i>
            <input
              v-model="search"
              class="filters__input"
              type="search"
              placeholder="جست‌وجو: نام یا موبایل…"
            />
          </div>
          <select v-model="verifiedFilter" class="field__select">
            <option value="">همه</option>
            <option value="pending">در انتظار تأیید</option>
            <option value="verified">تأییدشده</option>
          </select>
          <button type="submit" class="btn btn--primary" :disabled="auth.loading">
            جست‌وجو
          </button>
        </form>

        <div v-if="auth.loading && !customerRows.length" class="empty empty--inline">
          <i class="material-icons empty__icon spin">autorenew</i>
          <p class="empty__text">در حال دریافت…</p>
        </div>
        <div v-else-if="!customerRows.length" class="empty empty--inline">
          <i class="material-icons empty__icon">person_search</i>
          <p class="empty__text">مشتری‌ای یافت نشد</p>
        </div>

        <ul v-else class="cust-list">
          <li v-for="u in customerRows" :key="u.id" class="cust">

            <!-- Avatar + name -->
            <div class="cust__left">
              <div class="avatar" :class="u.verified ? 'avatar--ok' : 'avatar--warn'">
                {{ initials(u.name) }}
              </div>
              <div class="cust__info">
                <b class="cust__name">{{ u.name || '—' }}</b>
                <span class="cust__phone tnum" dir="ltr">{{ u.phone || 'بدون موبایل' }}</span>
                <span class="cust__id tnum muted">ID: {{ shortId(u.id) }}</span>
              </div>
            </div>

            <!-- Status badge -->
            <span class="badge" :class="u.verified ? 'badge--ok' : 'badge--warn'">
              <i class="material-icons">{{ u.verified ? 'verified_user' : 'hourglass_top' }}</i>
              {{ u.verified ? 'تأیید شده' : 'در انتظار' }}
            </span>

            <!-- Rejection note (if any) -->
            <div v-if="u.verifyNote" class="cust__note">
              <i class="material-icons">info_outline</i>
              دلیل رد قبلی: {{ u.verifyNote }}
            </div>

            <!-- Note input -->
            <input
              v-model="verifyNotes[u.id]"
              class="field__input"
              type="text"
              maxlength="300"
              placeholder="یادداشت (برای رد، دلیل بنویسید)"
            />

            <!-- Actions -->
            <div class="cust__actions">
              <button
                v-if="!u.verified"
                type="button"
                class="btn btn--primary btn--sm"
                :disabled="auth.loading"
                @click="verify(u, true)"
              >
                <i class="material-icons">how_to_reg</i> تأیید هویت
              </button>
              <button
                v-else
                type="button"
                class="btn btn--sm"
                :disabled="auth.loading"
                @click="verify(u, false)"
              >
                <i class="material-icons">cancel</i> لغو تأیید
              </button>
              <button
                type="button"
                class="btn btn--sm btn--danger"
                :disabled="auth.loading"
                @click="block(u)"
              >
                <i class="material-icons">block</i> مسدود
              </button>
              <button
                type="button"
                class="btn btn--sm"
                :disabled="auth.loading"
                @click="unblock(u)"
              >
                <i class="material-icons">lock_open</i> رفع مسدودی
              </button>
            </div>

          </li>
        </ul>
      </template>

      <!-- ════════════════════════════════════════════════════════════════════ -->
      <!-- Tab: cash approvals                                                  -->
      <!-- ════════════════════════════════════════════════════════════════════ -->
      <template v-else-if="tab === 'cash'">

        <!-- Deposits section -->
        <section class="cash-section">
          <header class="section-head">
            <div class="section-head__left">
              <span class="section-head__icon section-head__icon--in material-icons">savings</span>
              <span class="section-head__title">واریزها</span>
            </div>
            <span v-if="deposits.length" class="count-pill">{{ toFa(deposits.length) }}</span>
          </header>

          <div v-if="!deposits.length" class="cash-empty">
            <i class="material-icons">check_circle_outline</i>
            واریز در انتظاری وجود ندارد
          </div>

          <ul v-else class="cash-list">
            <li v-for="d in deposits" :key="d.id" class="cash-item">
              <div class="cash-item__top">
                <div class="cash-item__amount tnum">{{ faMoney(d.amount ?? d.total ?? 0) }}</div>
                <span class="cash-item__method">{{ methodFa(d.method) }}</span>
              </div>
              <div class="cash-item__meta">
                <span class="tnum muted">{{ shortId(d.id) }}</span>
                <span v-if="d.reference" class="tnum muted">پیگیری: {{ d.reference }}</span>
              </div>
              <div v-if="d.note" class="cash-item__note">{{ d.note }}</div>
              <div class="cash-item__actions">
                <button
                  type="button"
                  class="btn btn--primary btn--sm"
                  :disabled="auth.loading"
                  @click="decide('deposit', d.id, true)"
                >
                  <i class="material-icons">check_circle</i> تأیید واریز
                </button>
                <button
                  type="button"
                  class="btn btn--sm btn--danger"
                  :disabled="auth.loading"
                  @click="decide('deposit', d.id, false)"
                >
                  <i class="material-icons">cancel</i> رد
                </button>
              </div>
            </li>
          </ul>
        </section>

        <!-- Withdrawals section -->
        <section class="cash-section">
          <header class="section-head">
            <div class="section-head__left">
              <span class="section-head__icon section-head__icon--out material-icons">payments</span>
              <span class="section-head__title">برداشت‌ها</span>
            </div>
            <span v-if="withdrawals.length" class="count-pill">{{ toFa(withdrawals.length) }}</span>
          </header>

          <div v-if="!withdrawals.length" class="cash-empty">
            <i class="material-icons">check_circle_outline</i>
            برداشت در انتظاری وجود ندارد
          </div>

          <ul v-else class="cash-list">
            <li v-for="w in withdrawals" :key="w.id" class="cash-item">
              <div class="cash-item__top">
                <div class="cash-item__amount tnum">{{ faMoney(w.amount ?? w.total ?? 0) }}</div>
                <span class="cash-item__method cash-item__method--out">برداشت</span>
              </div>
              <div class="cash-item__meta">
                <span class="tnum muted">{{ shortId(w.id) }}</span>
              </div>
              <div v-if="w.destination" class="cash-item__note">
                <i class="material-icons">place</i> مقصد: {{ w.destination }}
              </div>
              <div class="cash-item__actions">
                <button
                  type="button"
                  class="btn btn--primary btn--sm"
                  :disabled="auth.loading"
                  @click="decide('withdrawal', w.id, true)"
                >
                  <i class="material-icons">task_alt</i> ثبت پرداخت
                </button>
                <button
                  type="button"
                  class="btn btn--sm btn--danger"
                  :disabled="auth.loading"
                  @click="decide('withdrawal', w.id, false)"
                >
                  <i class="material-icons">undo</i> رد و استرداد
                </button>
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
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { ROLES } from '../utils/roles'
import { faMoney, toFa } from '../utils/format'
import { openLogin } from '../utils/authGate'

const auth = useAuthStore()
const router = useRouter()

const tab = ref('customers')
const search = ref('')
const verifiedFilter = ref('')
const verifyNotes = reactive({})

const shortId = id => String(id ?? '').slice(0, 8)

function initials(name) {
  if (!name) return '؟'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return parts[0][0] + parts[1][0]
  return parts[0].slice(0, 2)
}

function methodFa(method) {
  const map = { BANK_TRANSFER: 'کارت به کارت', CARD: 'درگاه بانکی', CRYPTO: 'رمزارز' }
  return map[method] ?? method ?? '—'
}

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
  if (done) { verifyNotes[u.id] = ''; await loadCustomers() }
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

function openPrices() {
  router.push('/pricing-rules')
}

onMounted(async () => {
  if (!auth.isLoggedIn) return
  await Promise.all([loadCustomers(), auth.fetchCashPending()])
})
</script>

<style scoped>
/* ── Page shell ──────────────────────────────────────────────────────────── */
.page {
  max-width: 720px;
  margin: 0 auto;
  padding: 16px 14px 40px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ── Header ──────────────────────────────────────────────────────────────── */
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.title { margin: 0; font-size: 20px; font-weight: 900; letter-spacing: -0.3px; }
.sub { margin: 4px 0 0; font-size: 12px; color: var(--text-muted); }
.icon-btn {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 11px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 20px;
}
.is-spinning { animation: spin 0.9s linear infinite; }

/* ── Alert ───────────────────────────────────────────────────────────────── */
.alert {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  padding: 11px 14px;
  border-radius: 12px;
  background: var(--down-soft);
  color: var(--down);
  font-size: 13px;
}
.alert .material-icons { font-size: 17px; flex-shrink: 0; }

/* ── Summary stats strip ─────────────────────────────────────────────────── */
.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.stat {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 13px;
  border-radius: 14px;
  background: var(--card);
  border: 1px solid var(--border);
}
.stat__icon {
  font-size: 22px;
  color: var(--text-muted);
  opacity: 0.6;
}
.stat--warn .stat__icon { color: #c98a00; opacity: 1; }
.stat--accent .stat__icon { color: var(--accent); opacity: 1; }
.stat__body { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.stat__value { font-size: 20px; font-weight: 900; line-height: 1; }
.stat__label { font-size: 10.5px; color: var(--text-muted); white-space: nowrap; }

/* ── Tab bar ─────────────────────────────────────────────────────────────── */
.tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  padding: 5px;
  border-radius: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
}
.tab {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 10px 6px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 800;
  color: var(--text-muted);
  transition: background 0.15s, color 0.15s;
}
.tab .material-icons { font-size: 17px; }
.tab.is-on {
  background: var(--card);
  color: var(--accent);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}
.tab__badge {
  position: absolute;
  top: 4px;
  left: 6px;
  min-width: 18px;
  padding: 1px 5px;
  border-radius: 999px;
  background: var(--down);
  color: #fff;
  font-size: 10px;
  font-weight: 900;
  line-height: 1.5;
  text-align: center;
}

/* ── Filters row ─────────────────────────────────────────────────────────── */
.filters {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px;
  align-items: center;
}
.filters__input-wrap {
  position: relative;
}
.filters__icon {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 18px;
  color: var(--text-muted);
  pointer-events: none;
}
.filters__input {
  width: 100%;
  padding: 11px 40px 11px 13px;
  border-radius: 11px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--text);
  font: inherit;
  font-size: 13.5px;
  box-sizing: border-box;
}
.filters__input:focus { outline: none; border-color: var(--accent); }
.field__select {
  padding: 11px 13px;
  border-radius: 11px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}
.field__input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  box-sizing: border-box;
}
.field__input:focus { outline: none; border-color: var(--accent); }

/* ── Empty states ────────────────────────────────────────────────────────── */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 38px 20px;
  border-radius: 16px;
  border: 1px dashed var(--border);
  text-align: center;
}
.empty--inline { padding: 28px 0; border: none; }
.empty__icon { font-size: 40px; color: var(--text-muted); opacity: 0.4; }
.empty__text { margin: 0; font-size: 13.5px; font-weight: 700; color: var(--text-muted); }

/* ── Customer list ───────────────────────────────────────────────────────── */
.cust-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }

.cust {
  padding: 14px 15px;
  border-radius: 16px;
  background: var(--card);
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 11px;
}

.cust__left {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Avatar circle */
.avatar {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 15px;
  font-weight: 900;
  background: var(--surface);
  color: var(--text-muted);
  border: 2px solid var(--border);
}
.avatar--ok {
  background: var(--up-soft);
  color: var(--up);
  border-color: var(--up);
}
.avatar--warn {
  background: color-mix(in srgb, #d99a00 15%, var(--card));
  color: #c98a00;
  border-color: #d99a00;
}

.cust__info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cust__name { font-size: 14.5px; font-weight: 800; }
.cust__phone { font-size: 12px; color: var(--text-muted); }
.cust__id { font-size: 10.5px; color: var(--text-muted); }

.cust__note {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  font-size: 12px;
  color: var(--text-muted);
  padding: 8px 11px;
  background: var(--surface);
  border-radius: 9px;
  border: 1px solid var(--border);
  line-height: 1.6;
}
.cust__note .material-icons { font-size: 15px; flex-shrink: 0; margin-top: 1px; }

.cust__actions { display: flex; flex-wrap: wrap; gap: 8px; }

/* ── Badge ───────────────────────────────────────────────────────────────── */
.badge {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 11px 4px 10px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 800;
  border: 1px solid var(--border);
  background: var(--surface);
  white-space: nowrap;
}
.badge .material-icons { font-size: 13px; }
.badge--ok { background: var(--up-soft); color: var(--up); border-color: var(--up); }
.badge--warn { background: color-mix(in srgb, #d99a00 15%, var(--card)); color: #c98a00; border-color: #d99a00; }

/* ── Cash sections ───────────────────────────────────────────────────────── */
.cash-section {
  border-radius: 16px;
  background: var(--card);
  border: 1px solid var(--border);
  overflow: hidden;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}
.section-head__left { display: flex; align-items: center; gap: 8px; }
.section-head__icon {
  font-size: 20px;
}
.section-head__icon--in { color: var(--up); }
.section-head__icon--out { color: var(--accent); }
.section-head__title { font-size: 14px; font-weight: 800; }

.count-pill {
  min-width: 24px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--down);
  color: #fff;
  font-size: 11px;
  font-weight: 900;
  text-align: center;
}

.cash-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 18px 16px;
  font-size: 13px;
  color: var(--text-muted);
}
.cash-empty .material-icons { font-size: 18px; color: var(--up); }

.cash-list { list-style: none; margin: 0; padding: 0; }

.cash-item {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}
.cash-item:last-child { border-bottom: none; }

.cash-item__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.cash-item__amount { font-size: 18px; font-weight: 900; }
.cash-item__method {
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--up-soft);
  color: var(--up);
  border: 1px solid var(--up);
  font-size: 11px;
  font-weight: 800;
}
.cash-item__method--out {
  background: color-mix(in srgb, var(--accent) 12%, var(--card));
  color: var(--accent);
  border-color: var(--accent);
}

.cash-item__meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.cash-item__note {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.6;
}
.cash-item__note .material-icons { font-size: 14px; flex-shrink: 0; margin-top: 2px; }

.cash-item__actions { display: flex; flex-wrap: wrap; gap: 8px; }

/* ── Buttons ─────────────────────────────────────────────────────────────── */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 10px 17px;
  border-radius: 11px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 13.5px;
  font-weight: 800;
  white-space: nowrap;
  cursor: pointer;
  transition: opacity 0.15s;
}
.btn .material-icons { font-size: 16px; }
.btn--sm { padding: 8px 13px; font-size: 12.5px; }
.btn--sm .material-icons { font-size: 15px; }
.btn--primary { background: var(--accent); border-color: var(--accent); color: #14100a; }
.btn--danger { color: var(--down); border-color: var(--down); }
.btn--danger:hover:not(:disabled) { background: var(--down-soft); }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }

/* ── Helpers ─────────────────────────────────────────────────────────────── */
.muted { color: var(--text-muted); font-size: 12px; }
.tnum { font-variant-numeric: tabular-nums; }

@keyframes spin { to { transform: rotate(360deg); } }

/* ── Responsive ──────────────────────────────────────────────────────────── */
@media (max-width: 480px) {
  .stats { grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .stat { padding: 10px; gap: 7px; }
  .stat__icon { font-size: 18px; }
  .stat__value { font-size: 17px; }
  .filters { grid-template-columns: 1fr; }
  .filters__input-wrap { grid-column: 1 / -1; }
}
</style>
