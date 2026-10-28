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
              <b class="tnum">{{ o.ref || '#' + shortId(o.id) }}</b>
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
            <span v-if="o.amount" class="detail__item tnum">
              <i class="material-icons">payments</i>
              {{ faMoney(o.amount) }}
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

          <p v-if="isAwaiting(o)" class="awaiting-hint">
            <i class="material-icons">hourglass_top</i>
            مشتری هنوز رسید پرداخت را ارسال نکرده است
          </p>

          <!-- Review note — the reason is required to reject, and is sent to the customer -->
          <label class="field">
            <span class="field__label">یادداشت / دلیل رد</span>
            <input
              v-model="notes[o.id]"
              class="field__input"
              type="text"
              maxlength="200"
              placeholder="برای رد سفارش، دلیل را بنویسید"
              :disabled="auth.loading"
            />
          </label>
          <label v-if="o.status === 'PENDING_REVIEW'" class="refund">
            <input v-model="refunds[o.id]" type="checkbox" :disabled="auth.loading" />
            در صورت رد، مبلغ {{ faMoney((o.amount || 0) + (o.fee || 0)) }} به کیف پول مشتری برگردد
          </label>
          <p v-if="rowError[o.id]" class="alert">{{ rowError[o.id] }}</p>

          <!-- Action buttons -->
          <div class="actions">
            <button
              v-if="!isAwaiting(o)"
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
              v-if="!isAwaiting(o)"
              type="button"
              class="btn btn--sm"
              :disabled="auth.loading || !!(o.fulfilledAt || o.fulfilled)"
              @click="fulfill(o.id)"
            >
              <i class="material-icons">local_shipping</i> ثبت تحویل
            </button>
            <button
              v-if="!isAwaiting(o)"
              type="button"
              class="btn btn--sm"
              :disabled="downloadBusy[o.id]"
              @click="downloadReceipt(o)"
            >
              <i class="material-icons">{{ downloadBusy[o.id] ? 'hourglass_empty' : 'download' }}</i>
              دانلود رسید
            </button>
          </div>

        </li>
      </ul>

      <!-- Every recent order in this broker: wallet trades settle instantly and
           never enter the queue above, so they are listed here. -->
      <h2 class="section-title">همه سفارش‌های اخیر</h2>
      <p v-if="!recent.length" class="empty__hint">سفارشی ثبت نشده است</p>
      <ul v-else class="recent">
        <li v-for="o in recent" :key="o.id" class="recent__row">
          <div class="recent__main">
            <b class="tnum">{{ o.ref }}</b>
            <span class="side-badge" :class="o.side === 'SELL' ? 'is-sell' : 'is-buy'">
              {{ o.side === 'SELL' ? 'فروش' : 'خرید' }}
            </span>
            <span class="symbol tnum">{{ o.symbol }}</span>
            <span class="recent__kind">{{ o.kind === 'MANUAL' ? 'کارت به کارت' : 'کیف پول' }}</span>
          </div>
          <div class="recent__meta">
            <span>{{ o.customerName || o.customerPhone || '—' }}</span>
            <span class="tnum">{{ o.grams }} گرم · {{ faMoney(o.amount) }}</span>
            <span class="badge" :class="statusClass(o)">{{ o.status === 'FILLED' ? 'انجام‌شده' : statusFa(o) }}</span>
          </div>
          <p v-if="o.status === 'REJECTED' && o.reviewNote" class="recent__note">دلیل رد: {{ o.reviewNote }}</p>
          <template v-if="o.kind === 'TRADE' && o.status === 'FILLED'">
            <button v-if="!rejecting[o.id]" type="button" class="btn btn--danger btn--sm recent__reject" @click="rejecting[o.id] = true">
              <i class="material-icons">undo</i> رد سفارش
            </button>
            <div v-else class="recent__reject-form">
              <input
                v-model="notes[o.id]"
                class="field__input"
                type="text"
                maxlength="200"
                placeholder="دلیل رد (برای مشتری ارسال می‌شود)"
                :disabled="auth.loading"
              />
              <p class="recent__hint">
                {{ o.side === 'BUY'
                  ? `مبلغ ${faMoney((o.amount || 0) + (o.fee || 0))} به کیف پول برمی‌گردد و طلا از حساب مشتری کسر می‌شود`
                  : `طلا به حساب مشتری برمی‌گردد و مبلغ ${faMoney((o.amount || 0) - (o.fee || 0))} از کیف پول کسر می‌شود` }}
              </p>
              <p v-if="rowError[o.id]" class="alert">{{ rowError[o.id] }}</p>
              <div class="actions">
                <button type="button" class="btn btn--danger btn--sm" :disabled="auth.loading" @click="review(o.id, false)">تأیید رد</button>
                <button type="button" class="btn btn--sm" :disabled="auth.loading" @click="rejecting[o.id] = false">انصراف</button>
              </div>
            </div>
          </template>
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
const recent = ref([])
const loading = ref(false)
const notes = reactive({})
const refunds = reactive({})   // orderId → refund on reject (PENDING_REVIEW only)
const rejecting = reactive({}) // orderId → reject form open (recent list)
const rowError = reactive({})  // orderId → message
const downloadBusy = reactive({})

const shortId = id => String(id ?? '').slice(0, 8)

function statusFa(o) {
  const s = String(o.status || '').toUpperCase()
  if (s.includes('REJECT')) return 'رد شده'
  if (s.includes('APPROV') || s.includes('CONFIRM')) return 'تأیید شده'
  if (s.includes('FULFILL')) return 'تحویل‌شده'
  if (s === 'AWAITING_RECEIPT') return 'در انتظار رسید'
  return 'در انتظار بررسی'
}

const isAwaiting = o => String(o.status || '').toUpperCase() === 'AWAITING_RECEIPT'

function statusClass(o) {
  const s = String(o.status || '').toUpperCase()
  if (s.includes('REJECT')) return 'is-reject'
  if (s.includes('APPROV') || s.includes('CONFIRM')) return 'is-ok'
  if (s.includes('FULFILL') || s === 'FILLED') return 'is-done'
  if (s === 'AWAITING_RECEIPT') return 'is-muted'
  return 'is-warn'
}

async function load() {
  loading.value = true
  try {
    const [queue, all] = await Promise.all([auth.reviewQueue(), auth.brokerOrders()])
    orders.value = queue
    recent.value = all
    // Refund defaults on; the manager unticks it for a receipt they doubt.
    for (const o of queue) if (refunds[o.id] === undefined) refunds[o.id] = true
  } finally { loading.value = false }
}

async function review(id, approve) {
  rowError[id] = ''
  if (!approve && !(notes[id] || '').trim()) {
    rowError[id] = 'برای رد سفارش باید دلیل بنویسید'
    return
  }
  const { ok, error } = await auth.reviewOrder(id, approve, notes[id] || '', refunds[id] !== false)
  if (ok) {
    rejecting[id] = false
    await load()
  } else {
    rowError[id] = error
  }
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
.awaiting-hint { display: flex; align-items: center; gap: 6px; margin: 4px 0 0; font-size: 12px; color: var(--text-muted); }
.awaiting-hint .material-icons { font-size: 16px; }
.badge.is-muted { background: var(--surface); color: var(--text-muted); }
.section-title { margin: 24px 0 10px; font-size: 15px; font-weight: 900; }
.recent { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.recent__row { padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--card); display: flex; flex-direction: column; gap: 6px; }
.recent__main, .recent__meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12.5px; }
.recent__meta { justify-content: space-between; color: var(--text-muted); }
.recent__kind { margin-inline-start: auto; font-size: 11.5px; color: var(--text-muted); }
.refund { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 12px; color: var(--text-muted); }
.recent__note { margin: 0; font-size: 12px; color: var(--down); }
.recent__reject { align-self: flex-start; }
.recent__reject-form { display: flex; flex-direction: column; gap: 6px; }
.recent__hint { margin: 0; font-size: 11.5px; color: var(--text-muted); }
</style>
