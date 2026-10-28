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
        <li v-for="o in visible" :key="o.id" class="order-card" :class="{ 'order-card--awaiting': o.status === 'AWAITING_RECEIPT' }">

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

          <!-- ── Receipt upload (AWAITING_RECEIPT only) ── -->
          <template v-if="o.status === 'AWAITING_RECEIPT'">
            <div class="receipt-hint">
              <i class="material-icons">info_outline</i>
              مبلغ <b class="tnum">{{ faMoney(o.amount ?? o.price) }}</b> را به حساب کارگزار واریز کرده و رسید بانکی را بارگذاری کنید.
            </div>

            <div v-if="receiptError[o.id]" class="receipt-upload-error">
              <i class="material-icons">error_outline</i> {{ receiptError[o.id] }}
            </div>

            <div v-if="receiptSuccess[o.id]" class="receipt-upload-ok">
              <i class="material-icons">check_circle_outline</i> رسید با موفقیت ارسال شد — منتظر بررسی کارگزار باشید
            </div>

            <template v-else>
              <!-- File picker -->
              <label class="file-label">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  class="file-input"
                  @change="onFileChange(o.id, $event)"
                />
                <span class="file-btn">
                  <i class="material-icons">attach_file</i>
                  {{ receiptFiles[o.id] ? receiptFiles[o.id].name : 'انتخاب فایل رسید (تصویر یا PDF)' }}
                </span>
              </label>

              <!-- Optional note -->
              <input
                v-model="receiptNotes[o.id]"
                class="note-input"
                type="text"
                maxlength="300"
                placeholder="شماره پیگیری یا یادداشت (اختیاری)"
              />

              <!-- Submit -->
              <button
                type="button"
                class="btn btn--primary btn--upload"
                :disabled="!receiptFiles[o.id] || uploadBusy[o.id]"
                @click="sendReceipt(o)"
              >
                <i class="material-icons">{{ uploadBusy[o.id] ? 'hourglass_empty' : 'upload' }}</i>
                {{ uploadBusy[o.id] ? 'در حال ارسال…' : 'ارسال رسید به کارگزار' }}
              </button>
            </template>
          </template>

          <div class="order-card__footer">
            <span class="order-date tnum muted">{{ faJalaliDateTime(o.createdAt) }}</span>
            <button
              v-if="o.status !== 'AWAITING_RECEIPT'"
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

// ── Receipt upload state ─────────────────────────────────────────────────
const receiptFiles  = reactive({})   // orderId → File
const receiptNotes  = reactive({})   // orderId → string
const uploadBusy    = reactive({})   // orderId → bool
const receiptError  = reactive({})   // orderId → string
const receiptSuccess = reactive({})  // orderId → bool

function onFileChange(orderId, event) {
  const file = event.target.files?.[0]
  receiptFiles[orderId] = file || null
  receiptError[orderId] = ''
}

async function sendReceipt(order) {
  const file = receiptFiles[order.id]
  if (!file || uploadBusy[order.id]) return
  uploadBusy[order.id] = true
  receiptError[order.id] = ''
  const { ok, error } = await auth.uploadReceipt(
    order.id,
    file,
    receiptNotes[order.id] || '',
  )
  uploadBusy[order.id] = false
  if (ok) {
    receiptSuccess[order.id] = true
  } else {
    receiptError[order.id] = error || 'ارسال رسید ناموفق بود'
  }
}
// ────────────────────────────────────────────────────────────────────────

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

/* Awaiting receipt highlight */
.order-card--awaiting {
  border-color: #d99a00;
  background: color-mix(in srgb, #d99a00 5%, var(--card));
}

/* Receipt hint */
.receipt-hint {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, #d99a00 10%, var(--card));
  color: #b07a00;
  font-size: 12.5px;
  line-height: 1.6;
}
.receipt-hint .material-icons { font-size: 16px; flex-shrink: 0; margin-top: 1px; }

/* Upload error / success */
.receipt-upload-error {
  display: flex; align-items: center; gap: 6px;
  padding: 9px 12px; border-radius: 10px;
  background: var(--down-soft); color: var(--down); font-size: 12.5px;
}
.receipt-upload-error .material-icons { font-size: 16px; flex-shrink: 0; }
.receipt-upload-ok {
  display: flex; align-items: center; gap: 6px;
  padding: 9px 12px; border-radius: 10px;
  background: var(--up-soft); color: var(--up); font-size: 12.5px; font-weight: 700;
}
.receipt-upload-ok .material-icons { font-size: 16px; flex-shrink: 0; }

/* Hidden native file input */
.file-input { display: none; }
.file-label { display: block; }
.file-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 13px; border-radius: 10px;
  border: 1.5px dashed var(--border);
  background: var(--surface); color: var(--text-muted);
  font-size: 12.5px; font-weight: 700;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.file-btn:hover { border-color: var(--accent); color: var(--accent); }
.file-btn .material-icons { font-size: 18px; flex-shrink: 0; }

/* Note input */
.note-input {
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
.note-input:focus { outline: none; border-color: var(--accent); }

/* Upload button */
.btn--upload { width: 100%; justify-content: center; }

/* Spinner */
.spin { animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
