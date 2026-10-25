<template>
  <div class="tv2" dir="rtl">
    <header class="tv2__head">
      <h1 class="tv2__title"><i class="material-icons">receipt_long</i> معاملات سامانه</h1>
      <p class="tv2__sub">تمام خرید و فروش‌های سامانه از همه کاربران و کارگزاری‌ها</p>
    </header>

    <!-- Filters -->
    <section class="tv2__card tv2__filters">
      <div class="tv2__filter-row">
        <select v-model="filters.symbol" class="tv2__select" @change="apply">
          <option value="">همه نمادها</option>
          <option v-for="s in SYMBOLS_CONST" :key="s.symbol" :value="s.symbol">{{ s.name }}</option>
        </select>
        <select v-model="filters.side" class="tv2__select" @change="apply">
          <option value="">خرید/فروش</option>
          <option value="BUY">خرید</option>
          <option value="SELL">فروش</option>
        </select>
        <select v-model="filters.status" class="tv2__select" @change="apply">
          <option value="">همه وضعیت‌ها</option>
          <option v-for="st in STATUSES" :key="st" :value="st">{{ statusLabel(st) }}</option>
        </select>
        <select v-model="filters.brokerId" class="tv2__select" @change="apply">
          <option value="">همه کارگزاری‌ها</option>
          <option v-for="b in trades.brokers" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
      </div>
      <div class="tv2__filter-row">
        <input v-model="filters.userId" type="text" placeholder="شناسه کاربر" class="tv2__input" @keyup.enter="apply" />
        <input v-model="filters.from" type="date" class="tv2__input" @change="apply" />
        <input v-model="filters.to" type="date" class="tv2__input" @change="apply" />
        <button type="button" class="tv2__btn" @click="apply"><i class="material-icons">search</i> جستجو</button>
        <button type="button" class="tv2__btn tv2__btn--ghost" @click="reset"><i class="material-icons">restart_alt</i></button>
      </div>
    </section>

    <!-- Summary -->
    <section class="tv2__card tv2__summary">
      <div class="tv2__stat">
        <span class="tv2__stat-label">تعداد</span>
        <span class="tv2__stat-val">{{ toFa(trades.trades.length) }}</span>
      </div>
      <div class="tv2__stat">
        <span class="tv2__stat-label">حجم خرید</span>
        <span class="tv2__stat-val is-up">{{ faCompact(buyVolume) }}</span>
      </div>
      <div class="tv2__stat">
        <span class="tv2__stat-label">حجم فروش</span>
        <span class="tv2__stat-val is-down">{{ faCompact(sellVolume) }}</span>
      </div>
      <div class="tv2__stat">
        <span class="tv2__stat-label">گردش مالی</span>
        <span class="tv2__stat-val">{{ faCompact(turnover) }}</span>
      </div>
    </section>

    <!-- Trades table -->
    <section class="tv2__card tv2__table-card">
      <div v-if="trades.error" class="tv2__err">{{ trades.error }}</div>
      <div v-if="trades.loading" class="tv2__empty">در حال دریافت…</div>
      <div v-else-if="!trades.trades.length" class="tv2__empty">معامله‌ای یافت نشد</div>

      <div v-else class="tv2__table-scroll">
        <table class="tv2__table">
          <thead>
            <tr>
              <th>رج</th><th>نماد</th><th>سمت</th><th>قیمت</th><th>مقدار</th>
              <th>مبلغ</th><th>کاربر</th><th>کارگزاری</th><th>وضعیت</th><th>زمان</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in trades.trades" :key="t.id">
              <td class="tv2__ref">{{ t.ref }}</td>
              <td>{{ symbolShort(t.symbol) }}</td>
              <td><span class="tv2__side" :class="t.side === 'BUY' ? 'is-up' : 'is-down'">{{ t.side === 'BUY' ? 'خرید' : 'فروش' }}</span></td>
              <td>{{ faNumber(t.price) }}</td>
              <td>{{ faWeight(t.grams) }}</td>
              <td>{{ faNumber(t.amount) }}</td>
              <td class="tv2__user">{{ t.userName || '—' }}<span v-if="t.userPhone" class="tv2__user-phone">{{ t.userPhone }}</span></td>
              <td>{{ t.brokerName || '—' }}</td>
              <td><span class="tv2__status" :class="statusKind(t.status)">{{ statusLabel(t.status) }}</span></td>
              <td class="tv2__time">{{ faJalaliDateTime(t.createdAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useTradesStore } from '../stores/trades'
import { api } from '../utils/api'
import {
  faNumber, faWeight, faCompact, faJalaliDateTime, toFa,
  statusLabel, statusKind,
} from '../utils/format'

const trades = useTradesStore()

const SYMBOLS_CONST = ref([])
const STATUSES = ['FILLED', 'PENDING_REVIEW', 'APPROVED', 'FULFILLED', 'REJECTED', 'CANCELLED', 'AWAITING_RECEIPT']

const filters = ref({
  symbol: '', side: '', status: '', brokerId: '', userId: '', from: '', to: '',
})

function symbolShort(sym) {
  const map = { GOLD18: 'طلای ۱۸', COIN_NEW: 'سکه جدید', COIN_OLD: 'سکه قدیم', COIN_HALF: 'نیم سکه', COIN_QUARTER: 'ربع سکه' }
  return map[sym] || sym
}

const buyVolume = computed(() => trades.trades.filter(t => t.side === 'BUY').reduce((s, t) => s + Number(t.amount || 0), 0))
const sellVolume = computed(() => trades.trades.filter(t => t.side === 'SELL').reduce((s, t) => s + Number(t.amount || 0), 0))
const turnover = computed(() => trades.trades.reduce((s, t) => s + Number(t.amount || 0), 0))

async function apply() {
  await trades.fetchTrades(filters.value)
}

function reset() {
  filters.value = { symbol: '', side: '', status: '', brokerId: '', userId: '', from: '', to: '' }
  apply()
}

onMounted(async () => {
  try {
    const syms = await api.get('/superadmin/symbols')
    SYMBOLS_CONST.value = Array.isArray(syms) ? syms : []
  } catch { /* ignore */ }
  await trades.fetchBrokers()
  await apply()
})
</script>

<style scoped>
.tv2 { display: flex; flex-direction: column; gap: 12px; padding: 10px 12px 40px; max-width: 1100px; margin: 0 auto; font-variant-numeric: tabular-nums; }

.tv2__head { display: flex; flex-direction: column; gap: 2px; padding: 4px 2px; }
.tv2__title { display: flex; align-items: center; gap: 8px; font-size: 19px; font-weight: 900; margin: 0; }
.tv2__title i { color: var(--accent); font-size: 22px; }
.tv2__sub { margin: 0; font-size: 12.5px; color: var(--text-muted); }

.tv2__card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 12px; }

.tv2__filter-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.tv2__filter-row + .tv2__filter-row { margin-top: 8px; }
.tv2__select, .tv2__input {
  background: var(--surface); border: 1px solid var(--border); border-radius: 9px;
  color: var(--text); font-size: 13px; font-weight: 700; padding: 9px 10px; outline: none; font-family: inherit;
}
.tv2__input { min-width: 120px; }
.tv2__btn {
  display: inline-flex; align-items: center; gap: 6px; padding: 9px 14px; border-radius: 9px;
  font-size: 13px; font-weight: 800; cursor: pointer; border: 1px solid var(--border); background: var(--accent); color: #14100a;
}
.tv2__btn--ghost { background: var(--surface); color: var(--text); }

.tv2__summary { display: flex; gap: 10px; flex-wrap: wrap; }
.tv2__stat { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 130px; padding: 8px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; }
.tv2__stat-label { font-size: 10.5px; color: var(--text-muted); }
.tv2__stat-val { font-size: 17px; font-weight: 900; }
.tv2__stat-val.is-up { color: var(--up); }
.tv2__stat-val.is-down { color: var(--down); }

.tv2__empty { text-align: center; padding: 24px; font-size: 13px; color: var(--text-muted); }
.tv2__err { color: var(--down); font-size: 12px; font-weight: 700; margin-bottom: 8px; }

.tv2__table-scroll { overflow-x: auto; }
.tv2__table { width: 100%; border-collapse: collapse; font-size: 12px; }
.tv2__table th, .tv2__table td { padding: 9px 10px; text-align: right; border-bottom: 1px solid var(--border); white-space: nowrap; }
.tv2__table th { font-size: 10.5px; color: var(--text-muted); font-weight: 800; }
.tv2__ref { color: var(--text-muted); font-size: 11px; }
.tv2__side { font-weight: 800; }
.tv2__side.is-up { color: var(--up); }
.tv2__side.is-down { color: var(--down); }
.tv2__user { display: flex; flex-direction: column; }
.tv2__user-phone { font-size: 10px; color: var(--text-muted); }
.tv2__status { padding: 2px 8px; border-radius: 999px; font-size: 10.5px; font-weight: 700; }
.tv2__time { font-size: 10.5px; color: var(--text-muted); }
</style>
