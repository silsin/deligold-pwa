<template>
  <div class="sv" dir="rtl">
    <header class="sv__head">
      <h1 class="sv__title"><i class="material-icons">insights</i> منابع قیمت</h1>
      <p class="sv__sub">مدیریت، تنظیم و پایش زنده منابع قیمت سامانه</p>
    </header>

    <!-- Live chart -->
    <section class="sv__card sv__chart-card">
      <div class="sv__chart-head">
        <div class="sv__selectors">
          <select v-model="symbol" class="sv__select" @change="refreshTicks">
            <option v-for="s in sources.symbols" :key="s.symbol" :value="s.symbol">{{ s.name }}</option>
          </select>
          <select v-model="source" class="sv__select" @change="refreshTicks">
            <option value="">همه منابع</option>
            <option v-for="s in sources.sources" :key="s.name" :value="s.name">{{ s.name }}</option>
          </select>
          <select v-model="range" class="sv__select sv__select--sm" @change="refreshTicks">
            <option value="1h">۱ ساعت</option>
            <option value="24h">۲۴ ساعت</option>
            <option value="7d">۷ روز</option>
            <option value="30d">۳۰ روز</option>
          </select>
        </div>
        <div class="sv__last">
          <span class="sv__last-label">آخرین تیک</span>
          <span class="sv__last-price" :class="lastDir">{{ faMoney(lastPrice) }}</span>
          <span class="sv__last-time">{{ lastTime ? faTime(lastTime) : '—' }}</span>
        </div>
      </div>

      <div class="sv__chartwrap">
        <PriceChart :ticks="chartTicks" :range="range" mode="line" />
        <div v-if="!chartTicks.length" class="sv__empty">داده‌ای برای نمایش وجود ندارد — منتظر اولین تیک‌ها…</div>
      </div>

      <div v-if="latestPerSource.length" class="sv__readings">
        <div v-for="r in latestPerSource" :key="r.source" class="sv__reading">
          <span class="sv__reading-src" :class="{ 'is-off': !r.on }">{{ r.source }}</span>
          <span class="sv__reading-price">{{ faMoney(r.price) }}</span>
          <span v-if="r.buy != null || r.sell != null" class="sv__reading-spread">
            خرید {{ faMoney(r.sell) }} · فروش {{ faMoney(r.buy) }}
          </span>
        </div>
      </div>
    </section>

    <!-- Add source -->
    <section class="sv__card">
      <button type="button" class="sv__toggle-add" @click="showAdd = !showAdd">
        <i class="material-icons">{{ showAdd ? 'remove' : 'add' }}</i>
        {{ showAdd ? 'بستن افزودن منبع' : 'افزودن منبع قیمت' }}
      </button>

      <div v-if="showAdd" class="sv__add">
        <label class="sv__field">
          <span>نام منبع</span>
          <input v-model="form.name" type="text" placeholder="مثلاً manual-gold" class="sv__input" />
        </label>
        <label class="sv__field">
          <span>نوع</span>
          <select v-model="form.kind" class="sv__select">
            <option value="manual">دستی (قیمت ثابت)</option>
            <option value="trades">مشتق از معاملات</option>
          </select>
        </label>
        <label class="sv__field">
          <span>اولویت (کوچک‌تر = زودتر)</span>
          <input v-model.number="form.priority" type="number" min="0" class="sv__input" />
        </label>
        <label class="sv__field sv__field--full">
          <span>پیکربندی (JSON)</span>
          <textarea v-model="form.config" rows="3" class="sv__input" :placeholder="configPlaceholder"></textarea>
        </label>
        <label class="sv__field sv__field--full">
          <span>یادداشت</span>
          <input v-model="form.note" type="text" class="sv__input" />
        </label>
        <div class="sv__add-actions">
          <button type="button" class="sv__btn sv__btn--primary" :disabled="saving" @click="submitAdd">
            {{ saving ? 'در حال ذخیره…' : 'افزودن منبع' }}
          </button>
          <span v-if="addError" class="sv__err">{{ addError }}</span>
          <span v-if="addOk" class="sv__ok">منبع افزوده شد</span>
        </div>
      </div>
    </section>

    <!-- Sources list -->
    <section class="sv__card">
      <div class="sv__list-head">
        <h2 class="sv__h2">زنجیره منابع (به ترتیب اولویت)</h2>
        <button type="button" class="sv__btn sv__btn--ghost" @click="refreshAll">
          <i class="material-icons">refresh</i> بازخوانی
        </button>
      </div>

      <div v-if="sources.error" class="sv__err">{{ sources.error }}</div>

      <div v-for="(s, i) in sources.sources" :key="s.id" class="sv__row" :class="{ 'is-off': !s.enabled }">
        <div class="sv__row-main">
          <span class="sv__row-idx">{{ toFa(i + 1) }}</span>
          <div class="sv__row-id">
            <strong class="sv__row-name">{{ s.name }}</strong>
            <span class="sv__row-kind">{{ kindLabel(s.kind) }}{{ s.isSystem ? ' · داخلی' : '' }}</span>
          </div>
          <span class="sv__health" :class="s.health.fresh ? 'is-on' : 'is-off'">
            <i class="material-icons">{{ s.health.fresh ? 'check_circle' : 'error' }}</i>
            {{ s.health.fresh ? 'فعال' : 'بدون داده' }}
          </span>
        </div>

        <div class="sv__row-actions">
          <div class="sv__prio">
            <button type="button" class="sv__iconbtn" :disabled="i === 0" title="بالاتر در اولویت"
              @click="move(s, -1)"><i class="material-icons">arrow_upward</i></button>
            <span class="sv__prio-val">{{ toFa(s.priority) }}</span>
            <button type="button" class="sv__iconbtn" :disabled="i === sources.sources.length - 1" title="پایین‌تر در اولویت"
              @click="move(s, 1)"><i class="material-icons">arrow_downward</i></button>
          </div>

          <label class="sv__switch" :title="s.enabled ? 'غیرفعال' : 'فعال'">
            <input type="checkbox" :checked="s.enabled" @change="toggle(s, $event.target.checked)" />
            <span class="sv__switch-track"><span class="sv__switch-thumb" /></span>
          </label>

          <button type="button" class="sv__iconbtn" title="ویرایش پیکربندی" @click="openEdit(s)">
            <i class="material-icons">tune</i>
          </button>
          <button v-if="!s.isSystem" type="button" class="sv__iconbtn sv__iconbtn--danger" title="حذف"
            @click="remove(s)"><i class="material-icons">delete</i></button>
        </div>
      </div>
    </section>

    <!-- Edit sheet -->
    <div v-if="editing" class="sv__sheet" role="dialog" aria-label="ویرایش منبع">
      <div class="sv__sheet-scrim" @click="editing = null" />
      <div class="sv__sheet-panel">
        <header class="sv__sheet-head">
          <strong>ویرایش منبع: {{ editing.name }}</strong>
          <button type="button" class="sv__iconbtn" @click="editing = null"><i class="material-icons">close</i></button>
        </header>
        <div class="sv__add">
          <label class="sv__field"><span>نام</span>
            <input v-model="editing.name" type="text" class="sv__input" />
          </label>
          <label class="sv__field"><span>اولویت</span>
            <input v-model.number="editing.priority" type="number" min="0" class="sv__input" />
          </label>
          <label class="sv__field sv__field--full"><span>پیکربندی (JSON)</span>
            <textarea v-model="editing.config" rows="5" class="sv__input"></textarea>
          </label>
          <label class="sv__field sv__field--full"><span>یادداشت</span>
            <input v-model="editing.note" type="text" class="sv__input" />
          </label>
        </div>
        <footer class="sv__sheet-foot">
          <span v-if="editError" class="sv__err">{{ editError }}</span>
          <button type="button" class="sv__btn sv__btn--primary" :disabled="saving" @click="saveEdit">
            {{ saving ? 'در حال ذخیره…' : 'ذخیره' }}
          </button>
        </footer>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useSourcesStore } from '../stores/sources'
import PriceChart from '../components/PriceChart.vue'
import { faMoney, faTime, toFa } from '../utils/format'

const sources = useSourcesStore()

const symbol = ref('GOLD18')
const source = ref('')
const range = ref('24h')
const showAdd = ref(false)
const saving = ref(false)
const addError = ref('')
const addOk = ref(false)
const editing = ref(null)
const editError = ref('')

const form = ref({ name: '', kind: 'manual', priority: 100, config: '', note: '' })

const configPlaceholder = computed(() =>
  form.value.kind === 'trades'
    ? '{"windowMs": 86400000}'
    : '{"prices": {"GOLD18": {"price": 26000000, "buy": 25900000, "sell": 26100000}}}'
)

const chartTicks = computed(() => {
  const filtered = source.value
    ? sources.ticks.filter(t => t.source === source.value)
    : sources.ticks
  // Deduplicate by source so "all sources" plots one line per source is not
  // supported by the single-line chart; when no source is selected we show the
  // first source that has data so the chart still renders.
  return (filtered.length ? filtered : sources.ticks).map(t => ({ at: t.at, price: t.price }))
})

const lastPrice = computed(() => {
  const list = chartTicks.value
  return list.length ? list[list.length - 1].price : 0
})
const lastTime = computed(() => {
  const list = chartTicks.value
  return list.length ? list[list.length - 1].at : 0
})
const lastDir = computed(() => {
  const list = chartTicks.value
  if (list.length < 2) return ''
  return list[list.length - 1].price >= list[list.length - 2].price ? 'is-up' : 'is-down'
})

/** Latest reading per source, for the "current selected source" readings strip. */
const latestPerSource = computed(() => {
  const bySource = new Map()
  for (const t of sources.ticks) {
    if (t.symbol !== symbol.value) continue
    const prev = bySource.get(t.source)
    if (!prev || t.at >= prev.at) bySource.set(t.source, t)
  }
  const rows = []
  for (const s of sources.sources) {
    const t = bySource.get(s.name)
    rows.push({
      source: s.name,
      price: t?.price ?? 0,
      buy: t?.buy ?? null,
      sell: t?.sell ?? null,
      on: s.enabled,
    })
  }
  return rows
})

function kindLabel(k) {
  return { akbari: 'اکبری', tgju: 'تی‌جی‌جو', estjt: 'اتحاد', trades: 'معاملات', manual: 'دستی' }[k] || k
}

async function refreshTicks() {
  await sources.fetchTicks({ symbol: symbol.value, source: source.value, range: range.value })
}

async function refreshAll() {
  await Promise.all([sources.fetchSources(), refreshTicks()])
}

async function submitAdd() {
  addError.value = ''
  addOk.value = false
  let config = {}
  if (form.value.config.trim()) {
    try { config = JSON.parse(form.value.config) }
    catch { addError.value = 'پیکربندی JSON معتبر نیست'; return }
  }
  saving.value = true
  try {
    await sources.createSource({
      name: form.value.name,
      kind: form.value.kind,
      priority: form.value.priority,
      config,
      note: form.value.note,
    })
    addOk.value = true
    form.value = { name: '', kind: 'manual', priority: 100, config: '', note: '' }
    showAdd.value = false
    await sources.fetchSources()
  } catch (e) {
    addError.value = e.message || 'افزودن ناموفق بود'
  } finally {
    saving.value = false
  }
}

function openEdit(s) {
  editing.value = {
    id: s.id,
    name: s.name,
    priority: s.priority,
    config: JSON.stringify(s.config, null, 2),
    note: s.note || '',
  }
  editError.value = ''
}

async function saveEdit() {
  editError.value = ''
  let config
  try { config = editing.value.config.trim() ? JSON.parse(editing.value.config) : undefined }
  catch { editError.value = 'پیکربندی JSON معتبر نیست'; return }
  saving.value = true
  try {
    await sources.updateSource(editing.value.id, {
      name: editing.value.name,
      priority: editing.value.priority,
      config,
      note: editing.value.note,
    })
    editing.value = null
    await sources.fetchSources()
  } catch (e) {
    editError.value = e.message || 'ذخیره ناموفق بود'
  } finally {
    saving.value = false
  }
}

async function toggle(s, enabled) {
  try { await sources.updateSource(s.id, { enabled }); await sources.fetchSources() }
  catch (e) { /* ignore */ }
}

async function move(s, dir) {
  const list = [...sources.sources]
  const i = list.findIndex(x => x.id === s.id)
  const j = i + dir
  if (j < 0 || j >= list.length) return
  const a = list[i], b = list[j]
  // Swap priorities.
  await sources.reorderSources([
    { id: a.id, priority: b.priority },
    { id: b.id, priority: a.priority },
  ])
  await sources.fetchSources()
}

async function remove(s) {
  if (!confirm(`حذف منبع «${s.name}»؟`)) return
  try { await sources.deleteSource(s.id); await sources.fetchSources() }
  catch (e) { alert(e.message || 'حذف ناموفق بود') }
}

onMounted(async () => {
  await sources.fetchSources()
  await refreshTicks()
  sources.startTickPolling(() => {
    refreshTicks()
    sources.fetchSources()
  }, 8000)
})

onBeforeUnmount(() => {
  sources.stopTickPolling()
})
</script>

<style scoped>
.sv {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 10px 12px 40px;
  max-width: 760px;
  margin: 0 auto;
  font-variant-numeric: tabular-nums;
}

.sv__head { display: flex; flex-direction: column; gap: 2px; padding: 4px 2px; }
.sv__title { display: flex; align-items: center; gap: 8px; font-size: 19px; font-weight: 900; margin: 0; }
.sv__title i { color: var(--accent); font-size: 22px; }
.sv__sub { margin: 0; font-size: 12.5px; color: var(--text-muted); }

.sv__card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 14px;
}

.sv__chart-head {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.sv__selectors { display: flex; gap: 8px; flex-wrap: wrap; }
.sv__select {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 9px;
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
  padding: 9px 10px;
  outline: none;
}
.sv__select--sm { min-width: 96px; }

.sv__last { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; }
.sv__last-label { font-size: 10px; color: var(--text-muted); }
.sv__last-price { font-size: 20px; font-weight: 900; }
.sv__last-price.is-up { color: var(--up); }
.sv__last-price.is-down { color: var(--down); }
.sv__last-time { font-size: 10px; color: var(--text-muted); }

.sv__chartwrap { position: relative; height: 280px; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.sv__empty {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 12px; color: var(--text-muted); background: color-mix(in srgb, var(--card) 80%, transparent);
}

.sv__readings { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.sv__reading {
  display: flex; flex-direction: column; gap: 1px; padding: 8px 11px; border-radius: 9px;
  background: var(--surface); border: 1px solid var(--border); min-width: 130px;
}
.sv__reading-src { font-size: 11px; font-weight: 800; color: var(--accent); }
.sv__reading-src.is-off { color: var(--text-muted); }
.sv__reading-price { font-size: 15px; font-weight: 900; }
.sv__reading-spread { font-size: 10px; color: var(--text-muted); }

.sv__toggle-add {
  display: flex; align-items: center; gap: 7px; width: 100%;
  padding: 11px; border-radius: 10px; border: 1px dashed var(--border);
  background: var(--surface); color: var(--accent); font-size: 14px; font-weight: 800;
}
.sv__add { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
.sv__field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-muted); }
.sv__field--full { grid-column: 1 / -1; }
.sv__input {
  background: var(--surface); border: 1px solid var(--border); border-radius: 9px;
  color: var(--text); font-size: 14px; padding: 10px; outline: none; font-family: inherit;
}
textarea.sv__input { resize: vertical; font-family: monospace; }
.sv__add-actions { grid-column: 1 / -1; display: flex; align-items: center; gap: 10px; }

.sv__btn {
  display: inline-flex; align-items: center; gap: 6px; padding: 10px 16px; border-radius: 10px;
  font-size: 13.5px; font-weight: 800; cursor: pointer; border: 1px solid var(--border);
  background: var(--surface); color: var(--text);
}
.sv__btn--primary { background: var(--accent); border-color: var(--accent); color: #14100a; }
.sv__btn--primary:disabled { opacity: 0.5; cursor: not-allowed; }
.sv__btn--ghost { background: transparent; }

.sv__list-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.sv__h2 { font-size: 14px; font-weight: 800; margin: 0; }

.sv__row {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 11px 10px; border: 1px solid var(--border); border-radius: 11px; margin-bottom: 8px;
  background: var(--surface);
}
.sv__row.is-off { opacity: 0.5; }
.sv__row-main { display: flex; align-items: center; gap: 10px; min-width: 0; }
.sv__row-idx {
  display: flex; align-items: center; justify-content: center; width: 26px; height: 26px;
  border-radius: 7px; background: var(--card); border: 1px solid var(--border);
  font-size: 12px; font-weight: 800; color: var(--accent);
}
.sv__row-id { display: flex; flex-direction: column; min-width: 0; }
.sv__row-name { font-size: 14px; font-weight: 800; }
.sv__row-kind { font-size: 10.5px; color: var(--text-muted); }
.sv__health { display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; }
.sv__health.is-on { color: var(--up); }
.sv__health.is-off { color: var(--down); }
.sv__health i { font-size: 15px; }

.sv__row-actions { display: flex; align-items: center; gap: 8px; }
.sv__prio { display: flex; align-items: center; gap: 2px; }
.sv__prio-val { width: 26px; text-align: center; font-size: 12px; font-weight: 800; }
.sv__iconbtn {
  display: flex; align-items: center; justify-content: center; width: 34px; height: 34px;
  border-radius: 8px; border: 1px solid var(--border); background: var(--card); color: var(--text);
  cursor: pointer;
}
.sv__iconbtn:disabled { opacity: 0.35; cursor: not-allowed; }
.sv__iconbtn--danger { color: var(--down); }
.sv__iconbtn i { font-size: 18px; }

.sv__switch { position: relative; display: inline-flex; cursor: pointer; }
.sv__switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.sv__switch-track {
  width: 42px; height: 24px; border-radius: 999px; background: var(--border); transition: background 0.15s ease;
}
.sv__switch-thumb {
  position: absolute; top: 3px; right: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform 0.15s ease;
}
.sv__switch input:checked + .sv__switch-track { background: var(--up); }
.sv__switch input:checked + .sv__switch-track .sv__switch-thumb { transform: translateX(-18px); }

.sv__err { color: var(--down); font-size: 12px; font-weight: 700; }
.sv__ok { color: var(--up); font-size: 12px; font-weight: 700; }

.sv__sheet { position: fixed; inset: 0; z-index: 80; display: flex; align-items: flex-end; justify-content: center; }
.sv__sheet-scrim { position: absolute; inset: 0; background: rgba(0,0,0,0.5); }
.sv__sheet-panel {
  position: relative; width: min(92vw, 560px); max-height: 88vh; overflow-y: auto;
  background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 16px 16px 0 0;
  padding: 16px; margin-bottom: env(safe-area-inset-bottom);
}
.sv__sheet-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.sv__sheet-foot { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 8px; }
</style>
