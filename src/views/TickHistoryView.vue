<template>
  <div class="th" dir="rtl">
    <header class="th__head">
      <h1 class="th__title"><i class="material-icons">history_toggle_off</i> تاریخچه تیک‌ها</h1>
      <p class="th__sub">تمام تیک‌های ثبت‌شده از همه منابع — قابل پالایش و مدیریت</p>
    </header>

    <section class="th__card th__filters">
      <div class="th__row">
        <select v-model="filters.symbol" class="th__select" @change="apply">
          <option value="">همه نمادها</option>
          <option v-for="s in symbols" :key="s.symbol" :value="s.symbol">{{ s.name }}</option>
        </select>
        <select v-model="filters.source" class="th__select" @change="apply">
          <option value="">همه منابع</option>
          <option v-for="s in sourceNames" :key="s" :value="s">{{ s }}</option>
        </select>
        <input v-model="filters.from" type="date" class="th__input" @change="apply" />
        <input v-model="filters.to" type="date" class="th__input" @change="apply" />
        <button type="button" class="th__btn" @click="apply"><i class="material-icons">search</i> جستجو</button>
        <button type="button" class="th__btn th__btn--ghost" @click="reset"><i class="material-icons">restart_alt</i></button>
      </div>
    </section>

    <section class="th__card">
      <div class="th__bar">
        <span class="th__count">{{ toFa(total) }} تیک</span>
        <button type="button" class="th__btn th__btn--danger" @click="clearAll">
          <i class="material-icons">delete_sweep</i> پاک‌کردن نتایج
        </button>
      </div>

      <div v-if="loading" class="th__empty">در حال دریافت…</div>
      <div v-else-if="!rows.length" class="th__empty">تیکی یافت نشد</div>

      <div v-else class="th__scroll">
        <table class="th__table">
          <thead>
            <tr>
              <th>منبع</th><th>نماد</th><th>قیمت</th><th>خرید</th><th>فروش</th><th>زمان</th><th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in rows" :key="t.id">
              <td>{{ t.source }}</td>
              <td>{{ t.symbol }}</td>
              <td>{{ faNumber(t.price) }}</td>
              <td>{{ t.buy != null ? faNumber(t.buy) : '—' }}</td>
              <td>{{ t.sell != null ? faNumber(t.sell) : '—' }}</td>
              <td class="th__time">{{ faJalaliDateTime(t.at) }}</td>
              <td><button type="button" class="th__del" title="حذف" @click="del(t)"><i class="material-icons">delete</i></button></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="th__pager" v-if="rows.length || offset > 0">
        <button type="button" class="th__btn" :disabled="offset === 0" @click="prev">قبلی</button>
        <span>صفحه {{ toFa(page) }}</span>
        <button type="button" class="th__btn" :disabled="rows.length < limit" @click="next">بعدی</button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useSourcesStore } from '../stores/sources'
import { api } from '../utils/api'
import { faNumber, faJalaliDateTime, toFa } from '../utils/format'

const sources = useSourcesStore()

const symbols = ref([])
const sourceNames = ref([])
const rows = ref([])
const total = ref(0)
const loading = ref(false)
const limit = 100
const offset = ref(0)
const page = computed(() => Math.floor(offset.value / limit) + 1)

const filters = ref({ symbol: '', source: '', from: '', to: '' })

async function loadSources() {
  try { symbols.value = await api.get('/superadmin/symbols') || [] } catch { /* ignore */ }
  sourceNames.value = sources.sources.map(s => s.name)
}

async function apply() {
  loading.value = true
  try {
    const params = { limit: String(limit), offset: String(offset.value) }
    for (const [k, v] of Object.entries(filters.value)) if (v) params[k] = v
    const data = await sources.fetchTickHistory(params)
    rows.value = data.rows || []
    total.value = data.total || 0
  } finally {
    loading.value = false
  }
}

function reset() {
  filters.value = { symbol: '', source: '', from: '', to: '' }
  offset.value = 0
  apply()
}

function prev() { offset.value = Math.max(0, offset.value - limit); apply() }
function next() { offset.value += limit; apply() }

async function del(t) {
  try { await sources.deleteTick(t.id); await apply() } catch { /* ignore */ }
}

async function clearAll() {
  if (!confirm('حذف همه تیک‌های مطابق فیلتر؟')) return
  try {
    const payload = {}
    for (const [k, v] of Object.entries(filters.value)) if (v) payload[k] = v
    await sources.clearTicks(payload)
    offset.value = 0
    await apply()
  } catch { /* ignore */ }
}

onMounted(async () => {
  await sources.fetchSources()
  await loadSources()
  await apply()
})
</script>

<style scoped>
.th { display: flex; flex-direction: column; gap: 12px; padding: 10px 12px 40px; max-width: 1000px; margin: 0 auto; font-variant-numeric: tabular-nums; }
.th__head { display: flex; flex-direction: column; gap: 2px; padding: 4px 2px; }
.th__title { display: flex; align-items: center; gap: 8px; font-size: 19px; font-weight: 900; margin: 0; }
.th__title i { color: var(--accent); font-size: 22px; }
.th__sub { margin: 0; font-size: 12.5px; color: var(--text-muted); }
.th__card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 12px; }
.th__row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.th__select, .th__input { background: var(--surface); border: 1px solid var(--border); border-radius: 9px; color: var(--text); font-size: 13px; font-weight: 700; padding: 9px 10px; outline: none; font-family: inherit; }
.th__btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 14px; border-radius: 9px; font-size: 13px; font-weight: 800; cursor: pointer; border: 1px solid var(--border); background: var(--accent); color: #14100a; }
.th__btn:disabled { opacity: 0.4; cursor: not-allowed; }
.th__btn--ghost { background: var(--surface); color: var(--text); }
.th__btn--danger { background: var(--surface); color: var(--down); margin-right: auto; }
.th__bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.th__count { font-size: 12px; color: var(--text-muted); font-weight: 700; }
.th__empty { text-align: center; padding: 28px; font-size: 13px; color: var(--text-muted); }
.th__scroll { overflow-x: auto; }
.th__table { width: 100%; border-collapse: collapse; font-size: 12px; }
.th__table th, .th__table td { padding: 8px 10px; text-align: right; border-bottom: 1px solid var(--border); white-space: nowrap; }
.th__table th { font-size: 10.5px; color: var(--text-muted); font-weight: 800; }
.th__time { font-size: 10.5px; color: var(--text-muted); }
.th__del { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 7px; border: 1px solid var(--border); background: var(--surface); color: var(--down); cursor: pointer; }
.th__del i { font-size: 16px; }
.th__pager { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 10px; font-size: 12px; color: var(--text-muted); }
</style>
