<template>
  <div class="page">

    <header class="head">
      <div>
        <h1 class="title">تاریخچه معاملات</h1>
        <p class="sub">سفارش‌های ثبت‌شده شما</p>
      </div>
      <button
        type="button"
        class="icon-btn material-icons"
        :disabled="loading"
        title="بازآوری"
        @click="reload"
      >refresh</button>
    </header>

    <!-- Not logged in -->
    <div v-if="!auth.isLoggedIn" class="empty">
      <i class="material-icons empty__icon">receipt_long</i>
      <p class="empty__text">برای مشاهده تاریخچه وارد شوید</p>
      <button type="button" class="btn btn--primary" @click="openLogin('login')">
        <i class="material-icons">login</i> ورود به حساب
      </button>
    </div>

    <template v-else>
      <!-- Error banner for download failures -->
      <p v-if="downloadError" class="alert" role="alert">
        <i class="material-icons">error_outline</i> {{ downloadError }}
      </p>

      <!-- Filters -->
      <div class="filters">
        <button
          v-for="f in filters"
          :key="f.key"
          type="button"
          class="chip"
          :class="{ 'chip--on': active === f.key }"
          @click="setFilter(f.key)"
        >{{ f.label }}</button>
      </div>

      <!-- Loading -->
      <div v-if="loading && !orders.length" class="empty empty--inline">
        <i class="material-icons empty__icon spin">autorenew</i>
        <p class="empty__text">در حال دریافت…</p>
      </div>

      <!-- Empty state -->
      <div v-else-if="!visible.length" class="empty">
        <i class="material-icons empty__icon">inbox</i>
        <p class="empty__text">هنوز معامله‌ای ثبت نشده است</p>
      </div>

      <!-- Order list -->
      <ul v-else class="order-list">
        <li v-for="o in visible" :key="o.id" class="order-card">

          <div class="order-card__top">
            <div class="order-card__ref">
              <span class="side-badge" :class="o.side === 'BUY' ? 'is-buy' : 'is-sell'">
                {{ o.side === 'BUY' ? 'خرید' : 'فروش' }}
              </span>
              <b class="tnum">{{ o.symbol }}</b>
              <span v-if="o.ref" class="order-ref tnum">{{ o.ref }}</span>
            </div>
            <span class="status-badge" :class="statusClass(o.status)">{{ statusFa(o.status) }}</span>
          </div>

          <div class="order-card__detail">
            <span class="detail-item tnum">
              <i class="material-icons">scale</i>
              {{ faWeight(o.grams) }} گرم
            </span>
            <span class="detail-item tnum">
              <i class="material-icons">payments</i>
              {{ faMoney(o.price) }}
            </span>
            <span v-if="o.pnl !== null && o.pnl !== undefined" class="detail-item tnum" :class="Number(o.pnl) >= 0 ? 'is-up' : 'is-down'">
              <i class="material-icons">{{ Number(o.pnl) >= 0 ? 'trending_up' : 'trending_down' }}</i>
              {{ faDelta(o.pnl) }}
            </span>
          </div>

          <div class="order-card__footer">
            <span class="order-date tnum muted">{{ faJalaliDateTime(o.createdAt) }}</span>
            <button
              type="button"
              class="btn-receipt"
              :disabled="downloadBusy[o.id]"
              @click="handleDownload(o)"
            >
              <i class="material-icons">{{ downloadBusy[o.id] ? 'hourglass_empty' : 'download' }}</i>
              {{ downloadBusy[o.id] ? 'در حال دانلود…' : 'دانلود رسید' }}
            </button>
          </div>

        </li>
      </ul>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, reactive } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '../stores/auth'
import { faMoney, faWeight, faDelta, faJalaliDateTime } from '../utils/format'
import { openLogin } from '../utils/authGate'
import { downloadOrderReceipt } from '../utils/receipt.js'

const auth = useAuthStore()
const { orders, loading } = storeToRefs(auth)

const filters = [
  { key: 'all', label: 'همه' },
  { key: 'BUY', label: 'خرید' },
  { key: 'SELL', label: 'فروش' },
]
const active = ref('all')

const visible = computed(() => {
  if (active.value === 'all') return orders.value
  return orders.value.filter(o => o.side === active.value)
})

function setFilter(key) { active.value = key }

function statusFa(status) {
  const map = {
    FILLED: 'انجام شده',
    APPROVED: 'تأیید شده',
    REJECTED: 'رد شده',
    FULFILLED: 'تحویل شده',
    PENDING_REVIEW: 'در انتظار بررسی',
    AWAITING_RECEIPT: 'در انتظار رسید',
  }
  return map[status] ?? status ?? '—'
}

function statusClass(status) {
  if (status === 'FILLED' || status === 'APPROVED' || status === 'FULFILLED') return 'is-ok'
  if (status === 'REJECTED') return 'is-reject'
  return 'is-warn'
}

const downloadBusy = reactive({})
const downloadError = ref('')

async function handleDownload(order) {
  if (downloadBusy[order.id]) return
  downloadBusy[order.id] = true
  downloadError.value = ''
  try {
    await downloadOrderReceipt(order.id, order.ref)
  } catch (e) {
    downloadError.value = e?.message || 'دانلود رسید ناموفق بود'
  } finally {
    downloadBusy[order.id] = false
  }
}

async function reload() {
  await auth.fetchOrders()
}

onMounted(() => {
  if (auth.isLoggedIn) auth.fetchOrders()
})
</script>

<style scoped>
.page {
  max-width: 680px;
  margin: 0 auto;
  padding: 16px 14px 36px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-x: hidden;
}

/* ── Header ──────────────────────────────────────────────────────────────── */
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.title { margin: 0; font-size: 20px; font-weight: 900; }
.sub { margin: 4px 0 0; font-size: 12px; color: var(--text-muted); }
.icon-btn {
  flex-shrink: 0;
  width: 38px; height: 38px;
  display: grid; place-items: center;
  border-radius: 11px;
  background: var(--surface); border: 1px solid var(--border);
  color: var(--text-muted); font-size: 20px;
}

/* ── Alert ───────────────────────────────────────────────────────────────── */
.alert {
  display: flex; align-items: center; gap: 7px;
  margin: 0; padding: 10px 13px;
  border-radius: 11px;
  background: var(--down-soft); color: var(--down); font-size: 12.5px;
}
.alert .material-icons { font-size: 16px; flex-shrink: 0; }

/* ── Filters ─────────────────────────────────────────────────────────────── */
.filters { display: flex; gap: 6px; }
.chip {
  padding: 7px 16px; border-radius: 999px;
  border: 1px solid var(--border);
  background: transparent; color: var(--text-muted);
  font-size: 12.5px; font-weight: 700;
}
.chip--on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent);
}

/* ── Empty ───────────────────────────────────────────────────────────────── */
.empty {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  padding: 38px 20px;
  border-radius: 16px; border: 1px dashed var(--border);
  text-align: center;
}
.empty--inline { padding: 28px 0; border: none; }
.empty__icon { font-size: 40px; color: var(--text-muted); opacity: 0.4; }
.empty__text { margin: 0; font-size: 13.5px; font-weight: 700; color: var(--text-muted); }

/* ── Order list ──────────────────────────────────────────────────────────── */
.order-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }

.order-card {
  padding: 13px 15px;
  border-radius: 14px;
  background: var(--card); border: 1px solid var(--border);
  display: flex; flex-direction: column; gap: 10px;
}

/* Top row */
.order-card__top { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.order-card__ref { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.side-badge {
  padding: 3px 10px; border-radius: 999px;
  font-size: 11.5px; font-weight: 900;
}
.side-badge.is-buy { background: var(--up-soft); color: var(--up); }
.side-badge.is-sell { background: var(--down-soft); color: var(--down); }

.order-ref { font-size: 11.5px; color: var(--text-muted); }

/* Status badge */
.status-badge {
  padding: 3px 10px; border-radius: 999px;
  border: 1px solid var(--border); background: var(--surface);
  font-size: 11px; font-weight: 800;
}
.status-badge.is-ok { background: var(--up-soft); color: var(--up); border-color: var(--up); }
.status-badge.is-reject { background: var(--down-soft); color: var(--down); border-color: var(--down); }
.status-badge.is-warn { background: color-mix(in srgb, #d99a00 12%, var(--card)); color: #c98a00; border-color: #d99a00; }

/* Detail row */
.order-card__detail { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.detail-item {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 13px; font-weight: 700;
}
.detail-item .material-icons { font-size: 15px; color: var(--text-muted); }
.is-up { color: var(--up); }
.is-down { color: var(--down); }

/* Footer row */
.order-card__footer { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.order-date { font-size: 11.5px; }
.muted { color: var(--text-muted); }
.tnum { font-variant-numeric: tabular-nums; }

/* Download button */
.btn-receipt {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 7px 13px; border-radius: 9px;
  border: 1px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  color: var(--accent);
  font-size: 12.5px; font-weight: 800;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-receipt .material-icons { font-size: 16px; }
.btn-receipt:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 16%, transparent); }
.btn-receipt:disabled { opacity: 0.45; cursor: not-allowed; }

/* Buttons */
.btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 10px 17px; border-radius: 11px;
  border: 1px solid var(--border); background: var(--surface); color: var(--text);
  font: inherit; font-size: 13.5px; font-weight: 800;
}
.btn--primary { background: var(--accent); border-color: var(--accent); color: #14100a; }
.btn .material-icons { font-size: 17px; }

/* Spinner */
.spin { animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
