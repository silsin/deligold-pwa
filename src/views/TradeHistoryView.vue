<template>
  <div class="page">
    <div class="head">
      <h1 class="title">تاریخچه معاملات</h1>
      <span class="count">{{ faNumber(orders.length) }} سفارش</span>
    </div>

    <div class="filters">
      <button
        v-for="f in filters"
        :key="f.key"
        type="button"
        class="chip"
        :class="{ 'chip--on': active === f.key }"
        @click="setFilter(f.key)"
      >
        {{ f.label }}
      </button>
    </div>

    <div v-if="loading" class="state">در حال بارگذاری…</div>

    <p v-if="downloadError" class="download-err" role="alert">
      <i class="material-icons">error_outline</i> {{ downloadError }}
    </p>

    <div v-else-if="visible.length === 0" class="state">
      <template v-if="auth.isAuthenticated">
        هنوز معامله‌ای ثبت نشده است.
        <router-link to="/" class="link">شروع معامله</router-link>
      </template>
      <template v-else>
        برای مشاهده تاریخچه وارد شوید.
        <button type="button" class="link" @click="openLogin('login')">ورود</button>
      </template>
    </div>

    <table v-else class="table">
      <thead>
        <tr>
          <th>رسید</th>
          <th>نماد</th>
          <th>نوع</th>
          <th>مقدار</th>
          <th>قیمت</th>
          <th>سود/زیان</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="o in visible" :key="o.id">
          <td>
            <button
              v-if="['FILLED','APPROVED','REJECTED','FULFILLED'].includes(o.status)"
              type="button"
              class="btn-receipt"
              :disabled="downloadBusy[o.id]"
              :title="downloadBusy[o.id] ? 'در حال دانلود…' : 'دانلود رسید'"
              @click="downloadReceipt(o)"
            >
              <i class="material-icons">{{ downloadBusy[o.id] ? 'hourglass_empty' : 'download' }}</i>
              <span class="btn-receipt__label">دانلود رسید</span>
            </button>
            <span v-else class="receipt-na">—</span>
          </td>
          <td class="sym">{{ o.symbol }}</td>
          <td>
            <span class="badge" :class="o.side === 'BUY' ? 'is-buy' : 'is-sell'">
              {{ o.side === 'BUY' ? 'خرید' : 'فروش' }}
            </span>
          </td>
          <td class="num">{{ faWeight(o.grams) }} گرم</td>
          <td class="num">{{ faMoney(o.price) }}</td>
          <td class="num" :class="pnlClass(o.pnl)">
            {{ o.pnl === null ? '—' : faDelta(o.pnl) }}
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="!auth.isAuthenticated" class="state">
      برای مشاهده تاریخچهٔ سفارشات وارد حساب کاربری خود شوید.
      <button type="button" class="link" @click="openLogin('login')">ورود به حساب</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, reactive } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '../stores/auth'
import { faNumber, faMoney, faWeight, faDelta } from '../utils/format'
import { downloadOrderReceipt } from '../utils/receipt.js'

const auth = useAuthStore()
const { orders, loading } = storeToRefs(auth)

const filters = [
  { key: 'all', label: 'همه' },
  { key: 'BUY', label: 'خرید' },
  { key: 'SELL', label: 'فروش' }
]
const active = ref('all')

const visible = computed(() => {
  if (active.value === 'all') return orders.value
  return orders.value.filter(o => o.side === active.value)
})

function setFilter(key) {
  active.value = key
}

function pnlClass(value) {
  if (value === null || value === undefined) return ''
  return Number(value) >= 0 ? 'is-up' : 'is-down'
}

const downloadBusy = reactive({})
const downloadError = ref('')

async function downloadReceipt(order) {
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

onMounted(() => {
  if (auth.isAuthenticated) auth.fetchAccount()
})
</script>

<style scoped>
.page {
  max-width: 620px;
  margin: 0 auto;
  padding: 16px 14px 28px;
}

.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.title {
  margin: 0;
  font-size: 20px;
  font-weight: 900;
  color: var(--accent);
}

.count {
  font-size: 12px;
  color: var(--text-muted);
}

.filters {
  display: flex;
  gap: 6px;
  margin: 16px 0;
}

.chip {
  padding: 7px 16px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
}

.chip--on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
}

.state {
  padding: 28px 16px;
  border-radius: var(--radius);
  border: 1px dashed var(--border);
  background: var(--card);
  text-align: center;
  font-size: 13px;
  color: var(--text-muted);
  line-height: 2;
}

.link {
  color: var(--accent);
  font-weight: 800;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
  border-radius: var(--radius);
  overflow: hidden;
  border: 1px solid var(--border);
}

.table th,
.table td {
  padding: 11px 8px;
  text-align: right;
  border-bottom: 1px solid var(--border);
}

.table thead th {
  background: var(--surface);
  color: var(--text-muted);
  font-size: 11.5px;
  font-weight: 700;
}

.table tbody tr:last-child td {
  border-bottom: none;
}

.table tbody tr:nth-child(even) {
  background: color-mix(in srgb, var(--surface) 40%, transparent);
}

.sym {
  font-weight: 800;
}

.num {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.badge {
  display: inline-block;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
}

.badge.is-buy {
  background: var(--up-soft);
  color: var(--up);
}

.badge.is-sell {
  background: var(--down-soft);
  color: var(--down);
}

.is-up {
  color: var(--up);
}

.is-down {
  color: var(--down);
}

.btn-receipt {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: 8px;
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
.btn-receipt .material-icons { font-size: 15px; }
.btn-receipt:disabled { opacity: 0.45; cursor: not-allowed; }
.btn-receipt__label { display: none; }
@media (min-width: 480px) { .btn-receipt__label { display: inline; } }
.receipt-na { color: var(--text-muted); font-size: 12px; }

.download-err {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  padding: 10px 13px;
  border-radius: 11px;
  background: var(--down-soft);
  color: var(--down);
  font-size: 12.5px;
}
.download-err .material-icons { font-size: 16px; flex-shrink: 0; }
</style>

