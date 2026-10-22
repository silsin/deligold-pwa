<template>
  <div class="page">
    <header class="head">
      <div>
        <h1 class="title">صف بررسی سفارش‌ها</h1>
        <p class="sub">تأیید / رد رسیدها و ثبت تحویل (ویژه همکاران)</p>
      </div>
      <button type="button" class="icon-btn material-icons" :disabled="loading" title="بازآوری" @click="load">refresh</button>
    </header>

    <div v-if="!auth.isLoggedIn" class="empty">
      <i class="material-icons empty__icon">lock_outline</i>
      <p class="empty__text">برای دیدن صف بررسی، ابتدا وارد شوید</p>
      <button type="button" class="btn btn--primary" @click="openLogin('login')">ورود</button>
    </div>

    <template v-else>
      <p v-if="auth.error" class="alert" role="alert">{{ auth.error }}</p>

      <div v-if="loading && !orders.length" class="empty empty--inline">
        <i class="material-icons empty__icon spin">autorenew</i>
        <p class="empty__text">در حال دریافت…</p>
      </div>

      <div v-else-if="!orders.length" class="empty">
        <i class="material-icons empty__icon">fact_check</i>
        <p class="empty__text">صف بررسی خالی است</p>
        <p class="empty__hint">همه سفارش‌ها بررسی شده‌اند</p>
      </div>

      <ul v-else class="cards">
        <li v-for="o in orders" :key="o.id" class="card">

          <!-- Top row: ref + side badge -->
          <div class="card__top">
            <div class="card__ref">
              <b class="tnum">#{{ shortId(o.id) }}</b>
              <span class="side-badge" :class="o.side === 'SELL' ? 'is-sell' : 'is-buy'">
                {{ o.side === 'SELL' ? 'فروش' : 'خرید' }}
              </span>
              <span class="symbol tnum">{{ o.symbol }}</span>
            </div>
            <span class="badge" :class="statusClass(o)">{{ statusFa(o) }}</span>
          </div>

          <!-- Order detail row -->
          <div class="card__detail">
            <span class="detail__item tnum">
              <i class="material-icons">scale</i>
              {{ o.grams }} گرم
            </span>
            <span v-if="o.totalAmount" class="detail__item tnum">
              <i class="material-icons">payments</i>
              {{ faMoney(o.totalAmount) }}
            </span>
            <span v-if="o.fulfilledAt || o.fulfilled" class="badge is-done">
              <i class="material-icons">check_circle</i> تحویل‌شده
            </span>
          </div>

          <!-- Receipt link -->
          <a
            v-if="o.receiptUrl"
            class="receipt-link"
            :href="o.receiptUrl"
            target="_blank"
            rel="noopener"
          >
            <i class="material-icons">receipt_long</i>
            مشاهده رسید پرداخت
          </a>

          <!-- Review note -->
          <label class="field">
            <span class="field__label">یادداشت بررسی</span>
            <input
              v-model="notes[o.id]"
              class="field__input"
              type="text"
              maxlength="200"
              placeholder="توضیح (اختیاری)"
              :disabled="auth.loading"
            />
          </label>

          <!-- Action buttons -->
          <div class="actions">
            <button
              type="button"
              class="btn btn--primary btn--sm"
              :disabled="auth.loading"
              @click="review(o.id, true)"
            >
              <i class="material-icons">check</i> تأیید
            </button>
            <button
              type="button"
              class="btn btn--danger btn--sm"
              :disabled="auth.loading"
              @click="review(o.id, false)"
            >
              <i class="material-icons">close</i> رد
            </button>
            <button
              type="button"
              class="btn btn--sm"
              :disabled="auth.loading || !!(o.fulfilledAt || o.fulfilled)"
              @click="fulfill(o.id)"
            >
              <i class="material-icons">local_shipping</i> ثبت تحویل
            </button>
            <button
              type="button"
              class="btn btn--sm"
              v-if="['APPROVED','REJECTED','FULFILLED'].includes(o.status)"
              :disabled="downloadBusy[o.id]"
              @click="downloadReceipt(o)"
            >
              <i class="material-icons">{{ downloadBusy[o.id] ? 'hourglass_empty' : 'download' }}</i>
              دانلود رسید
            </button>
          </div>

        </li>
      </ul>
    </template>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { faMoney } from '../utils/format'
import { openLogin } from '../utils/authGate'
import { downloadOrderReceipt } from '../utils/receipt.js'

const auth = useAuthStore()
const orders = ref([])
const loading = ref(false)
const notes = reactive({})
const downloadBusy = reactive({})

const shortId = id => String(id ?? '').slice(0, 8)

function statusFa(o) {
  const s = String(o.status || '').toUpperCase()
  if (s.includes('REJECT')) return 'رد شده'
  if (s.includes('APPROV') || s.includes('CONFIRM')) return 'تأیید شده'
  if (s.includes('FULFILL')) return 'تحویل‌شده'
  return 'در انتظار بررسی'
}

function statusClass(o) {
  const s = String(o.status || '').toUpperCase()
  if (s.includes('REJECT')) return 'is-reject'
  if (s.includes('APPROV') || s.includes('CONFIRM')) return 'is-ok'
  if (s.includes('FULFILL')) return 'is-done'
  return 'is-warn'
}

async function load() {
  loading.value = true
  try { orders.value = await auth.reviewQueue() } finally { loading.value = false }
}

async function review(id, approve) {
  const { ok } = await auth.reviewOrder(id, approve, notes[id] || '')
  if (ok) await load()
}

async function fulfill(id) {
  const { ok } = await auth.fulfillOrder(id)
  if (ok) await load()
}

async function downloadReceipt(o) {
  if (downloadBusy[o.id]) return
  downloadBusy[o.id] = true
  try {
    await downloadOrderReceipt(o.id, o.ref)
  } catch (e) {
    auth.error = e?.message || 'دانلود رسید ناموفق بود'
  } finally {
    downloadBusy[o.id] = false
  }
}

onMounted(() => { if (auth.isLoggedIn) load() })
</script>

<style scoped>
.page {
  max-width: 720px;
  margin: 0 auto;
  padding: 16px 14px 30px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ── Header ─────────────────────────────────────────────────────────────── */
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.title { margin: 0; font-size: 19px; font-weight: 900; }
.sub { margin: 4px 0 0; font-size: 12px; color: var(--text-muted); }
.icon-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-muted);
  flex-shrink: 0;
}

/* ── Alert ───────────────────────────────────────────────────────────────── */
.alert {
  margin: 0;
  padding: 10px 13px;
  border-radius: 12px;
  background: var(--down-soft);
  color: var(--down);
  font-size: 12.5px;
}

/* ── Empty state ─────────────────────────────────────────────────────────── */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 36px 18px;
  border-radius: 16px;
  border: 1px dashed var(--border);
  text-align: center;
}
.empty--inline { padding: 30px 0; border: none; }
.empty__icon { font-size: 38px; color: var(--text-muted); opacity: 0.5; }
.empty__text { margin: 0; font-size: 13.5px; color: var(--text-muted); font-weight: 700; }
.empty__hint { margin: 0; font-size: 12px; color: var(--text-muted); opacity: 0.7; }

/* ── Card list ───────────────────────────────────────────────────────────── */
.cards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card {
  padding: 14px 15px;
  border-radius: 14px;
  background: var(--card);
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 11px;
}

/* Top row */
.card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.card__ref {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13.5px;
}
.card__ref b { font-size: 13px; color: var(--text-muted); }
.symbol { font-size: 12.5px; color: var(--text-muted); }

/* Side badge (buy / sell) */
.side-badge {
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 900;
}
.side-badge.is-buy { background: var(--up-soft); color: var(--up); }
.side-badge.is-sell { background: var(--down-soft); color: var(--down); }

/* Status badge */
.badge {
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.badge .material-icons { font-size: 13px; }
.badge.is-ok { background: var(--up-soft); color: var(--up); border-color: var(--up); }
.badge.is-reject { background: var(--down-soft); color: var(--down); border-color: var(--down); }
.badge.is-done { background: color-mix(in srgb, var(--accent) 15%, var(--card)); color: var(--accent); border-color: var(--accent); }
.badge.is-warn { background: color-mix(in srgb, #d99a00 12%, var(--card)); color: #c98a00; border-color: #d99a00; }

/* Detail row */
.card__detail {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.detail__item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 700;
}
.detail__item .material-icons { font-size: 15px; color: var(--text-muted); }

/* Receipt link */
.receipt-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--accent);
  text-decoration: none;
}
.receipt-link .material-icons { font-size: 16px; }
.receipt-link:hover { text-decoration: underline; }

/* Note field */
.field { display: flex; flex-direction: column; gap: 5px; }
.field__label { font-size: 11.5px; color: var(--text-muted); }
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

/* Action buttons */
.actions { display: flex; flex-wrap: wrap; gap: 8px; }

.btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 10px 16px;
  border-radius: 11px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 13.5px;
  font-weight: 800;
  white-space: nowrap;
  cursor: pointer;
}
.btn--sm { padding: 8px 13px; font-size: 12.5px; }
.btn--sm .material-icons { font-size: 15px; }
.btn--primary { background: var(--accent); border-color: var(--accent); color: #14100a; }
.btn--danger { color: var(--down); border-color: var(--down); }
.btn--danger:hover:not(:disabled) { background: var(--down-soft); }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }

/* Spinner */
.spin {
  animation: spin 0.9s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
