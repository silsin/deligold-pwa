<template>
  <div class="page">
    <header class="head">
      <div>
        <h1 class="title">گزارش‌ها</h1>
        <p class="sub">تراز آزمایشی و گزارش معاملات (ویژه مدیران)</p>
      </div>
      <button type="button" class="icon-btn material-icons" :disabled="w.loading" title="بازآوری" @click="load">refresh</button>
    </header>

    <p v-if="w.error" class="alert" role="alert">{{ w.error }}</p>

    <div v-if="w.loading && !hasData" class="empty empty--inline">
      <p class="empty__text">در حال دریافت…</p>
    </div>

    <template v-else>
      <!-- Trial balance -->
      <section class="card">
        <header class="card__head">
          <span><i class="material-icons">balance</i> تراز آزمایشی</span>
          <span v-if="tb?.balanced != null" class="badge" :class="tb.balanced ? 'is-ok' : 'is-bad'">
            {{ tb.balanced ? 'متوازن' : 'نامتوازن' }}
          </span>
        </header>

        <div v-if="tbDifference != null" class="kv">
          <span>اختلاف</span>
          <b class="tnum" :class="Number(tbDifference) === 0 ? 'is-up' : 'is-down'">{{ faMoney(tbDifference) }}</b>
        </div>

        <table v-if="tbRows.length" class="table">
          <thead>
            <tr>
              <th v-for="(c, i) in tbColumns" :key="i">{{ c }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, r) in tbRows" :key="r">
              <td v-for="(c, i) in tbColumns" :key="i" class="num">{{ cellOf(row, c) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else-if="tbDifference == null" class="muted">داده‌ای برای نمایش نیست.</p>
      </section>

      <!-- Trades -->
      <section class="card">
        <header class="card__head">
          <span><i class="material-icons">receipt_long</i> گزارش معاملات</span>
          <span v-if="tradesRows.length" class="count">{{ faNumber(tradesRows.length) }} ردیف</span>
        </header>

        <table v-if="tradesRows.length" class="table">
          <thead>
            <tr>
              <th v-for="(c, i) in tradesColumns" :key="i">{{ c }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, r) in tradesRows" :key="r">
              <td v-for="(c, i) in tradesColumns" :key="i" class="num">{{ cellOf(row, c) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="muted">معامله‌ای ثبت نشده است.</p>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useStoresStore } from '../stores/wholesale'
import { faMoney, faNumber } from '../utils/format'

const w = useStoresStore()

const tb = computed(() => w.reports?.trialBalance ?? null)

/** The API may answer with a flat object or {rows}; handle both shapes. */
function rowsOf(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.rows)) return payload.rows
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.data)) return payload.data
  return []
}

const tbRows = computed(() => rowsOf(tb.value))
const tradesRows = computed(() => rowsOf(w.reports?.trades))
const hasData = computed(() => Boolean(tb.value) || tradesRows.value.length > 0)

/** Column headers come from the first row's keys — never a hard-coded list. */
const LABELS = {
  account: 'حساب', name: 'نام', code: 'کد', kind: 'نوع', type: 'نوع',
  debit: 'بدهکار', credit: 'بستانکار', balance: 'مانده', amount: 'مبلغ',
  grams: 'گرم', symbol: 'نماد', side: 'طرف', status: 'وضعیت', createdAt: 'زمان',
  date: 'تاریخ', user: 'کاربر', total: 'جمع', difference: 'اختلاف', count: 'تعداد'
}
const tbColumns = computed(() => Object.keys(tbRows.value[0] ?? {}).map(k => LABELS[k] ?? k))
const tradesColumns = computed(() => Object.keys(tradesRows.value[0] ?? {}).map(k => LABELS[k] ?? k))

const tbDifference = computed(() => tb.value?.difference ?? null)

function cellOf(row, label) {
  const key = Object.keys(row).find(k => (LABELS[k] ?? k) === label)
  const v = row[key]
  return typeof v === 'object' && v !== null ? JSON.stringify(v) : (v ?? '—')
}

async function load() {
  try { await w.fetchReports() } finally { /* error surfaced via w.error */ }
}

onMounted(load)
</script>

<style scoped>
.page {
  padding: 0 12px 130px;
  max-width: 720px;
  margin: 0 auto;
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin: 12px 0 14px;
}

.title { margin: 0; font-size: 19px; font-weight: 900; }

.sub { margin: 4px 0 0; font-size: 12px; color: var(--text-muted); }

.icon-btn {
  flex: 0 0 auto;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 11px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-muted);
}

.icon-btn:disabled { opacity: 0.5; }

.card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 14px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: var(--card);
}

.card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 14px;
  font-weight: 800;
}

.card__head .material-icons {
  margin-inline-end: 6px;
  font-size: 20px;
  vertical-align: -4px;
  color: var(--accent);
}

.badge { padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 800; }
.badge.is-ok { background: var(--up-soft); color: var(--up); }
.badge.is-bad { background: var(--down-soft); color: var(--down); }
.count { font-size: 11px; font-weight: 700; color: var(--text-muted); }

.kv {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--surface);
  font-size: 13px;
}

.table { width: 100%; border-collapse: collapse; font-size: 12.5px; }

.table th,
.table td {
  padding: 8px 6px;
  text-align: right;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

.table th { font-size: 11px; color: var(--text-muted); font-weight: 700; }
.table .num { font-variant-numeric: tabular-nums; }
.is-up { color: var(--up); }
.is-down { color: var(--down); }
.muted { margin: 0; font-size: 12.5px; color: var(--text-muted); text-align: center; }

.alert {
  margin: 0 0 12px;
  padding: 10px 13px;
  border-radius: 12px;
  background: var(--down-soft);
  color: var(--down);
  font-size: 12.5px;
}

.empty--inline { padding: 30px 0; }
.empty__text { margin: 0; font-size: 13px; color: var(--text-muted); text-align: center; }
</style>
