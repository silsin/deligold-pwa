<template>
  <div class="rp" dir="rtl">
    <header class="rp__head">
      <h1 class="rp__title"><i class="material-icons">assessment</i> گزارش‌گیری</h1>
      <p class="rp__sub">انواع گزارش در فرمت‌های مختلف — ویژه مدیران کارگزاری</p>
    </header>

    <!-- Report picker -->
    <section class="rp__card">
      <div class="rp__types">
        <button
          v-for="t in REPORT_TYPES"
          :key="t.id"
          type="button"
          class="rp__type"
          :class="{ 'is-active': selected === t.id }"
          @click="select(t.id)"
        >
          <i class="material-icons">{{ t.icon }}</i>
          <span>{{ t.label }}</span>
        </button>
      </div>
    </section>

    <!-- Filters -->
    <section v-if="current" class="rp__card rp__filters">
      <h2 class="rp__h2">{{ current.label }}</h2>
      <div class="rp__filter-row">

        <!-- Date range (all report types) -->
        <label class="rp__field">
          <span>از تاریخ</span>
          <input v-model="filters.from" type="date" class="rp__input" />
        </label>
        <label class="rp__field">
          <span>تا تاریخ</span>
          <input v-model="filters.to" type="date" class="rp__input" />
        </label>

        <!-- Symbol (trades, orders, positions) -->
        <label v-if="current.filters.includes('symbol')" class="rp__field">
          <span>نماد</span>
          <select v-model="filters.symbol" class="rp__input">
            <option value="">همه نمادها</option>
            <option value="GOLD18">طلای ۱۸ عیار</option>
            <option value="COIN_NEW">سکه امامی</option>
            <option value="COIN_OLD">سکه بهار آزادی</option>
            <option value="COIN_HALF">نیم سکه</option>
            <option value="COIN_QUARTER">ربع سکه</option>
          </select>
        </label>

        <!-- Side (orders) -->
        <label v-if="current.filters.includes('side')" class="rp__field">
          <span>طرف</span>
          <select v-model="filters.side" class="rp__input">
            <option value="">خرید و فروش</option>
            <option value="BUY">خرید</option>
            <option value="SELL">فروش</option>
          </select>
        </label>

        <!-- Order status -->
        <label v-if="current.filters.includes('status')" class="rp__field">
          <span>وضعیت</span>
          <select v-model="filters.status" class="rp__input">
            <option value="">همه</option>
            <option v-for="s in current.statusOptions ?? ORDER_STATUSES" :key="s.value" :value="s.value">{{ s.label }}</option>
          </select>
        </label>

        <!-- Order kind -->
        <label v-if="current.filters.includes('kind')" class="rp__field">
          <span>نوع سفارش</span>
          <select v-model="filters.kind" class="rp__input">
            <option value="">همه</option>
            <option value="TRADE">معامله</option>
            <option value="MANUAL">دستی</option>
            <option value="CONVERT">تبدیل</option>
          </select>
        </label>

        <!-- Ledger kind -->
        <label v-if="current.filters.includes('ledgerKind')" class="rp__field">
          <span>نوع ثبت</span>
          <select v-model="filters.kind" class="rp__input">
            <option value="">همه</option>
            <option value="DEPOSIT">واریز</option>
            <option value="WITHDRAWAL">برداشت</option>
            <option value="BUY">خرید</option>
            <option value="SELL">فروش</option>
            <option value="FEE">کارمزد</option>
            <option value="CONVERT">تبدیل</option>
            <option value="ADJUSTMENT">اصلاح</option>
          </select>
        </label>

        <!-- Verified (customers) -->
        <label v-if="current.filters.includes('verified')" class="rp__field">
          <span>احراز هویت</span>
          <select v-model="filters.verified" class="rp__input">
            <option value="">همه</option>
            <option value="true">تأیید شده</option>
            <option value="false">تأیید نشده</option>
          </select>
        </label>

        <!-- Min/max balance (wallets) -->
        <label v-if="current.filters.includes('balance')" class="rp__field">
          <span>حداقل موجودی</span>
          <input v-model.number="filters.minBalance" type="number" class="rp__input" placeholder="—" />
        </label>
        <label v-if="current.filters.includes('balance')" class="rp__field">
          <span>حداکثر موجودی</span>
          <input v-model.number="filters.maxBalance" type="number" class="rp__input" placeholder="—" />
        </label>
      </div>

      <!-- Format + actions -->
      <div class="rp__actions">
        <div class="rp__fmt">
          <button
            v-for="f in FORMATS"
            :key="f.id"
            type="button"
            class="rp__fmtbtn"
            :class="{ 'is-active': format === f.id }"
            @click="format = f.id"
          ><i class="material-icons">{{ f.icon }}</i> {{ f.label }}</button>
        </div>
        <button type="button" class="rp__btn rp__btn--primary" :disabled="loading" @click="run">
          <i class="material-icons">{{ loading ? 'autorenew' : 'play_arrow' }}</i>
          {{ loading ? 'در حال تهیه…' : 'تهیه گزارش' }}
        </button>
        <button v-if="format !== 'json' && rows.length" type="button" class="rp__btn" @click="download">
          <i class="material-icons">download</i> دانلود {{ format.toUpperCase() }}
        </button>
      </div>

      <p v-if="error" class="rp__err">{{ error }}</p>
    </section>

    <!-- In-page preview (JSON / summary) -->
    <section v-if="rows.length" class="rp__card rp__preview">
      <div class="rp__preview-head">
        <span class="rp__count">{{ toFa(rows.length) }} ردیف</span>
        <span v-if="summary" class="rp__summary">{{ summary }}</span>
      </div>
      <div class="rp__scroll">
        <table class="rp__table">
          <thead>
            <tr>
              <th v-for="col in columns" :key="col">{{ LABELS[col] ?? col }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in previewRows" :key="i">
              <td v-for="col in columns" :key="col">{{ fmtCell(row[col]) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="rows.length > PREVIEW_LIMIT" class="rp__more">
          نمایش {{ toFa(PREVIEW_LIMIT) }} ردیف از {{ toFa(rows.length) }} — برای مشاهده کامل دانلود کنید
        </p>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, reactive } from 'vue'
import { api } from '../utils/api.js'
import { toFa, faNumber, faMoney, faJalaliDateTime, faStatus } from '../utils/format.js'

const PREVIEW_LIMIT = 100

const LABELS = {
  ref: 'شماره', symbol: 'نماد', side: 'طرف', kind: 'نوع', status: 'وضعیت',
  grams: 'گرم', price: 'قیمت', amount: 'مبلغ', fee: 'کارمزد', pnl: 'سود/زیان',
  userName: 'نام', userPhone: 'تلفن', balance: 'موجودی', realizedPnl: 'سود محقق',
  orderCount: 'سفارش‌ها', verified: 'احراز هویت', createdAt: 'تاریخ ثبت',
  postedAt: 'تاریخ ثبت دفتر', totalDebit: 'بدهکار', totalCredit: 'بستانکار',
  memo: 'شرح', avgCost: 'بهای تمام‌شده', value: 'ارزش', code: 'کد', name: 'نام',
  type: 'نوع', debit: 'بدهکار', credit: 'بستانکار', net: 'خالص', balance2: 'مانده',
  avgPrice: 'میانگین قیمت', totalGrams: 'حجم گرم', totalAmount: 'حجم مبلغ',
  totalFee: 'کارمزد کل', realisedPnl: 'سود', destination: 'مقصد', note: 'یادداشت',
  method: 'روش', email: 'ایمیل', nationalId: 'کد ملی', positions: 'موجودی طلا',
}

const SIDE = { BUY: 'خرید', SELL: 'فروش' }
const STATUS_FA = {
  FILLED: 'تکمیل', PENDING_REVIEW: 'در انتظار بررسی', APPROVED: 'تأیید شده',
  FULFILLED: 'تحویل داده شد', REJECTED: 'رد شده', CANCELLED: 'لغو شده',
  AWAITING_RECEIPT: 'در انتظار رسید', ACTIVE: 'فعال', SUSPENDED: 'مسدود',
  PENDING: 'در انتظار',
  DEPOSIT: 'واریز', WITHDRAWAL: 'برداشت', BUY: 'خرید', SELL: 'فروش',
  FEE: 'کارمزد', CONVERT: 'تبدیل', ADJUSTMENT: 'اصلاح', STORE_IN: 'ورود انبار',
  STORE_OUT: 'خروج انبار', ASSET: 'دارایی', LIABILITY: 'بدهی',
  EQUITY: 'سرمایه', REVENUE: 'درآمد', EXPENSE: 'هزینه',
  TRADE: 'معامله', MANUAL: 'دستی',
}

const ORDER_STATUSES = [
  { value: 'FILLED', label: 'تکمیل' },
  { value: 'AWAITING_RECEIPT', label: 'در انتظار رسید' },
  { value: 'PENDING_REVIEW', label: 'در انتظار بررسی' },
  { value: 'APPROVED', label: 'تأیید شده' },
  { value: 'FULFILLED', label: 'تحویل داده شد' },
  { value: 'REJECTED', label: 'رد شده' },
  { value: 'CANCELLED', label: 'لغو شده' },
]
const CASH_STATUSES = [
  { value: 'PENDING', label: 'در انتظار' },
  { value: 'APPROVED', label: 'تأیید شده' },
  { value: 'REJECTED', label: 'رد شده' },
]

const REPORT_TYPES = [
  { id: 'trial-balance', label: 'تراز آزمایشی', icon: 'balance', filters: [], endpoint: '/reports/trial-balance' },
  { id: 'trades',        label: 'خلاصه معاملات', icon: 'show_chart', filters: ['symbol'], endpoint: '/reports/trades' },
  { id: 'orders',        label: 'لیست سفارشات', icon: 'receipt_long', filters: ['symbol', 'side', 'status', 'kind'], endpoint: '/reports/orders' },
  { id: 'customers',     label: 'مشتریان', icon: 'groups', filters: ['verified', 'status'], statusOptions: [{ value: 'ACTIVE', label: 'فعال' }, { value: 'SUSPENDED', label: 'مسدود' }], endpoint: '/reports/customers' },
  { id: 'wallets',       label: 'کیف پول‌ها', icon: 'account_balance_wallet', filters: ['balance'], endpoint: '/reports/wallets' },
  { id: 'deposits',      label: 'واریزها', icon: 'south_west', filters: ['status'], statusOptions: CASH_STATUSES, endpoint: '/reports/deposits' },
  { id: 'withdrawals',   label: 'برداشت‌ها', icon: 'north_east', filters: ['status'], statusOptions: CASH_STATUSES, endpoint: '/reports/withdrawals' },
  { id: 'positions',     label: 'موجودی طلا', icon: 'inventory_2', filters: ['symbol'], endpoint: '/reports/positions' },
  { id: 'ledger',        label: 'دفتر کل', icon: 'menu_book', filters: ['ledgerKind'], endpoint: '/reports/ledger' },
]

const FORMATS = [
  { id: 'json', label: 'پیش‌نمایش', icon: 'preview' },
  { id: 'csv',  label: 'CSV',        icon: 'table_chart' },
  { id: 'pdf',  label: 'PDF',        icon: 'picture_as_pdf' },
]

const selected = ref('trades')
const format = ref('json')
const loading = ref(false)
const error = ref('')
const rows = ref([])
const columns = ref([])

const filters = reactive({
  from: '', to: '', symbol: '', side: '', status: '', kind: '',
  verified: '', minBalance: null, maxBalance: null,
})

const current = computed(() => REPORT_TYPES.find(t => t.id === selected.value) ?? null)
const previewRows = computed(() => rows.value.slice(0, PREVIEW_LIMIT))
const summary = computed(() => {
  if (!rows.value.length) return ''
  const r = rows.value
  const total = r.reduce((s, x) => s + (Number(x.amount) || Number(x.totalAmount) || Number(x.balance) || 0), 0)
  return total ? `جمع مبالغ: ${faNumber(Math.round(total))} تومان` : ''
})

function select(id) {
  selected.value = id
  rows.value = []
  columns.value = []
  error.value = ''
}

function buildParams() {
  const p = new URLSearchParams()
  if (filters.from) p.set('from', filters.from)
  if (filters.to) p.set('to', filters.to)
  if (filters.symbol) p.set('symbol', filters.symbol)
  if (filters.side) p.set('side', filters.side)
  if (filters.status) p.set('status', filters.status)
  if (filters.kind) p.set('kind', filters.kind)
  if (filters.verified) p.set('verified', filters.verified)
  if (filters.minBalance != null && filters.minBalance !== '') p.set('minBalance', filters.minBalance)
  if (filters.maxBalance != null && filters.maxBalance !== '') p.set('maxBalance', filters.maxBalance)
  return p
}

async function run() {
  if (!current.value) return
  loading.value = true
  error.value = ''
  rows.value = []
  columns.value = []
  try {
    const params = buildParams()
    // Always fetch JSON for the in-page preview; download endpoints handle format conversion server-side.
    const data = await api.get(`${current.value.endpoint}?${params.toString()}`)
    // Unwrap { success, data } if wrapped
    const payload = data?.data ?? data
    const list = Array.isArray(payload) ? payload : (Array.isArray(payload?.rows) ? payload.rows : [])
    rows.value = list
    columns.value = list.length ? Object.keys(list[0]) : []
  } catch (e) {
    error.value = e?.message || 'دریافت گزارش ناموفق بود'
  } finally {
    loading.value = false
  }
}

async function download() {
  if (!current.value || format.value === 'json') return
  const params = buildParams()
  params.set('format', format.value)
  const url = `${current.value.endpoint}?${params.toString()}`
  // Open in a new tab — the browser's native download triggers from the
  // Content-Disposition header the server sends.
  window.open(url, '_blank')
}

function fmtCell(v) {
  if (v == null) return '—'
  if (typeof v === 'boolean') return v ? 'بله' : 'خیر'
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return faJalaliDateTime(v)
  if (v instanceof Date) return faJalaliDateTime(v)
  const s = String(v)
  if (STATUS_FA[s]) return STATUS_FA[s]
  if (SIDE[s]) return SIDE[s]
  if (/^\d+(\.\d+)?$/.test(s) && Number(s) > 1000) return faNumber(Number(s))
  return s
}
</script>

<style scoped>
.rp {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 10px 12px 60px;
  max-width: 1000px;
  margin: 0 auto;
  font-variant-numeric: tabular-nums;
}

.rp__head { display: flex; flex-direction: column; gap: 2px; padding: 4px 2px; }
.rp__title { display: flex; align-items: center; gap: 8px; font-size: 19px; font-weight: 900; margin: 0; }
.rp__title i { color: var(--accent); font-size: 22px; }
.rp__sub { margin: 0; font-size: 12.5px; color: var(--text-muted); }

.rp__card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 14px;
}

/* Report type picker */
.rp__types { display: flex; flex-wrap: wrap; gap: 8px; }
.rp__type {
  display: flex; align-items: center; gap: 7px; padding: 9px 14px; border-radius: 11px;
  border: 1px solid var(--border); background: var(--surface); color: var(--text-muted);
  font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.15s ease;
}
.rp__type i { font-size: 18px; }
.rp__type.is-active {
  border-color: var(--accent); color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

/* Filters */
.rp__h2 { font-size: 14px; font-weight: 800; margin: 0 0 10px; }
.rp__filter-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; margin-bottom: 12px; }
.rp__field { display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; color: var(--text-muted); font-weight: 700; }
.rp__input {
  background: var(--surface); border: 1px solid var(--border); border-radius: 9px;
  color: var(--text); font-size: 13px; padding: 9px 10px; outline: none; font-family: inherit;
  min-width: 120px;
}
.rp__input:focus { border-color: var(--accent); }

/* Format + actions bar */
.rp__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.rp__fmt { display: flex; gap: 6px; }
.rp__fmtbtn {
  display: inline-flex; align-items: center; gap: 5px; padding: 8px 12px; border-radius: 9px;
  border: 1px solid var(--border); background: var(--surface); color: var(--text-muted);
  font-size: 12px; font-weight: 700; cursor: pointer;
}
.rp__fmtbtn i { font-size: 16px; }
.rp__fmtbtn.is-active { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
.rp__btn {
  display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px; border-radius: 10px;
  border: 1px solid var(--border); background: var(--surface); color: var(--text);
  font-size: 13.5px; font-weight: 800; cursor: pointer;
}
.rp__btn i { font-size: 18px; }
.rp__btn--primary { background: var(--accent); border-color: var(--accent); color: #14100a; }
.rp__btn:disabled { opacity: 0.5; cursor: not-allowed; }
.rp__err { color: var(--down); font-size: 12px; font-weight: 700; margin: 6px 0 0; }

/* Preview table */
.rp__preview-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.rp__count { font-size: 12px; font-weight: 700; color: var(--text-muted); }
.rp__summary { font-size: 12px; font-weight: 700; color: var(--accent); }
.rp__scroll { overflow-x: auto; }
.rp__table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.rp__table th, .rp__table td { padding: 8px 9px; text-align: right; border-bottom: 1px solid var(--border); white-space: nowrap; }
.rp__table th { font-size: 10.5px; color: var(--text-muted); font-weight: 800; background: var(--surface); }
.rp__more { margin: 8px 0 0; font-size: 11.5px; color: var(--text-muted); text-align: center; }

@media (max-width: 500px) {
  .rp__types { gap: 6px; }
  .rp__type { padding: 8px 10px; font-size: 12px; }
  .rp__type span { display: none; }
}
</style>
