<template>
  <div class="page">
    <h1 class="title">تنظیمات</h1>

    <section class="block">
      <h2 class="section-title">پوسته برنامه</h2>
      <div class="palettes">
        <button
          v-for="p in palettes"
          :key="p.id"
          type="button"
          class="palette"
          :class="{ 'is-on': active === p.id }"
          @click="choose(p.id)"
        >
          <span class="palette__swatch" :style="{ background: `linear-gradient(135deg, ${p.bg} 0 55%, ${p.accent} 55% 100%)` }"></span>
          <span class="palette__name">{{ p.name }}</span>
        </button>
      </div>
      <p class="hint">همان پوسته‌های سایت دلی گلد — انتخاب شما روی این دستگاه ذخیره می‌شود.</p>
    </section>

    <section class="block">
      <h2 class="section-title">نمودار</h2>
      <div class="modes">
        <button type="button" class="chip" :class="{ 'chip--on': mode === 'candle' }" @click="setMode('candle')">
          شمعی
        </button>
        <button type="button" class="chip" :class="{ 'chip--on': mode === 'line' }" @click="setMode('line')">
          خطی
        </button>
      </div>
    </section>

    <section class="block">
      <h2 class="section-title">نوار متحرک قیمت‌ها</h2>
      <label class="switch">
        <input v-model="showTicker" type="checkbox" @change="saveTickerPref" />
        <span class="switch__track"><span class="switch__knob"></span></span>
        <span class="switch__text">
          نمایش نوار متحرک قیمت‌ها در صفحه اصلی
        </span>
      </label>
      <p class="hint">نوار بالای صفحه اصلی که به‌صورت مداوم نمادها را نمایش می‌دهد.</p>
    </section>

    <section class="block">
      <p class="hint">به‌صورت پیش‌فرض فقط خرید/فروش نماد منتخب (۲ دکمه) نمایش داده می‌شود. نمادهای بیشتر را از اینجا فعال کنید.</p>
      <div class="modes">
        <button
          v-for="s in market.symbols"
          :key="s.symbol"
          type="button"
          class="chip"
          :class="{ 'chip--on': featured === s.symbol }"
          @click="setFeatured(s.symbol)"
        >
          ★ {{ s.short || s.name }}
        </button>
      </div>
      <div class="symlist">
        <label v-for="s in market.symbols" :key="s.symbol" class="switch">
          <input v-model="visibleSet" type="checkbox" :value="s.symbol" @change="saveVisibleSet" />
          <span class="switch__track"><span class="switch__knob"></span></span>
          <span class="switch__text">{{ s.name }}</span>
        </label>
      </div>
      <button type="button" class="btn btn--ghost btn--block" @click="resetBoardPrefs">
        بازگشت به پیش‌فرض (فقط نماد منتخب)
      </button>
    </section>

    <section class="block">
      <h2 class="section-title">به‌روزرسانی خودکار</h2>
      <label class="switch">
        <input v-model="autoRefresh" type="checkbox" @change="togglePolling" />
        <span class="switch__track"><span class="switch__knob"></span></span>
        <span class="switch__text">
          دریافت قیمت هر ۱۵ ثانیه
          <small v-if="market.updatedAt">آخرین داده: {{ faAgo(market.updatedAt) }}</small>
        </span>
      </label>
      <button type="button" class="btn btn--ghost btn--block" @click="refresh">
        به‌روزرسانی دستی
      </button>
    </section>

    <section class="block">
      <h2 class="section-title">منبع قیمت</h2>
      <div class="source">
        <span class="source__dot" :class="market.stale ? 'is-stale' : 'is-live'"></span>
        <span>{{ market.sourceTitle || 'در حال دریافت…' }}</span>
      </div>
      <p v-if="market.note" class="warn">{{ market.note }}</p>
    </section>

    <section class="block">
      <h2 class="section-title">درباره</h2>
      <dl class="about">
        <div><dt>نسخه</dt><dd>۱٫۰٫۰</dd></div>
        <div><dt>کارمزد معاملات</dt><dd>{{ faPercent(auth.feePercent, 1) }}</dd></div>
        <div><dt>واحد پول</dt><dd>تومان</dd></div>
      </dl>
      <p class="hint">
        اپلیکیشن معاملاتی دلی گلد — قیمت‌ها از اتحادیه طلا و جواهر و سامانه فروشگاهی دریافت می‌شود.
      </p>
    </section>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { THEME_PALETTES, applyPalette, loadPaletteId, savePaletteId } from '../theme'
import { useMarketStore } from '../stores/market'
import { useAuthStore } from '../stores/auth'
import { loadFeatured, loadVisible, saveFeatured, saveVisible } from '../utils/boardPrefs'
import { faAgo, faPercent } from '../utils/format'

function loadTickerPref() {
  try {
    const stored = localStorage.getItem('dg_show_ticker')
    return stored === null ? false : stored === 'true'
  } catch {
    return false
  }
}

function saveTickerPref() {
  try {
    localStorage.setItem('dg_show_ticker', showTicker.value.toString())
    window.dispatchEvent(new Event('dg-ticker-pref'))
  } catch {
    /* ignore */
  }
}

const market = useMarketStore()
const auth = useAuthStore()

const palettes = THEME_PALETTES
const active = ref(loadPaletteId())
const autoRefresh = ref(true)
const mode = ref(localStorage.getItem('dg_trade_chart_mode') || 'candle')
const showTicker = ref(loadTickerPref())

const featured = ref(loadFeatured())
const visibleSet = ref(loadVisible() ?? [])

function notifyBoard() {
  try {
    window.dispatchEvent(new Event('dg-board-prefs'))
  } catch {
    /* ignore */
  }
}

function setFeatured(symbol) {
  featured.value = symbol
  saveFeatured(symbol)
  // Featured symbol is always visible, even in default (featured-only) mode.
  if (visibleSet.value.length && !visibleSet.value.includes(symbol)) {
    visibleSet.value = [...visibleSet.value, symbol]
    saveVisible(visibleSet.value)
  }
  notifyBoard()
}

function saveVisibleSet() {
  saveVisible(visibleSet.value.length ? [...visibleSet.value] : null)
  notifyBoard()
}

function resetBoardPrefs() {
  visibleSet.value = []
  saveVisible(null)
  notifyBoard()
}

function choose(id) {
  active.value = id
  savePaletteId(id)
  applyPalette(id)
}

function setMode(next) {
  mode.value = next
  try {
    localStorage.setItem('dg_trade_chart_mode', next)
  } catch {
    /* storage unavailable — the choice simply won't persist */
  }
  // TradingView listens for the storage event and repaints; nothing to refetch.
}

function togglePolling() {
  if (autoRefresh.value) market.startPolling(15000)
  else market.stopPolling()
}

async function refresh() {
  await market.fetchMarket({ record: true })
}

onMounted(() => {
  applyPalette(active.value)
})
</script>

<style scoped>
.page {
  max-width: 560px;
  margin: 0 auto;
  padding: 16px 14px 28px;
}

.title {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 900;
  color: var(--accent);
}

.block {
  margin-bottom: 22px;
}

.palettes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
}

.palette {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  padding: 11px 6px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--card);
  transition: border-color 0.16s ease;
}

.palette.is-on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--card));
}

.palette__swatch {
  width: 100%;
  height: 34px;
  border-radius: 8px;
  border: 1px solid var(--border);
}

.palette__name {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--text-muted);
}

.palette.is-on .palette__name {
  color: var(--accent);
}

.modes {
  display: flex;
  gap: 6px;
}

.chip {
  padding: 8px 18px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  font-size: 12.5px;
  font-weight: 700;
}

.chip--on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
}

.symlist {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.switch {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.switch input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.switch__track {
  position: relative;
  flex: 0 0 auto;
  width: 46px;
  height: 26px;
  border-radius: 999px;
  background: var(--border);
  transition: background 0.2s ease;
}

.switch input:checked + .switch__track {
  background: var(--up);
}

.switch__knob {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s ease;
}

/* RTL layout: the knob travels to the left when on. */
.switch input:checked + .switch__track .switch__knob {
  transform: translateX(-20px);
}

.switch__text {
  display: flex;
  flex-direction: column;
  font-size: 13px;
  font-weight: 600;
}

.switch__text small {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
}

.btn--ghost {
  width: 100%;
  margin-top: 12px;
  padding: 12px 0;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--card);
  font-size: 13.5px;
  font-weight: 800;
}

.source {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 13px;
  border-radius: var(--radius-sm);
  background: var(--card);
  border: 1px solid var(--border);
  font-size: 12.5px;
}

.source__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: 0 0 auto;
}

.source__dot.is-live {
  background: var(--up);
}

.source__dot.is-stale {
  background: var(--down);
}

.warn {
  margin: 8px 0 0;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--down-soft);
  color: var(--down);
  font-size: 12px;
  line-height: 1.6;
}

.about {
  display: flex;
  flex-direction: column;
  margin: 0;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--card);
  overflow: hidden;
}

.about > div {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  font-size: 12.5px;
  border-bottom: 1px solid var(--border);
}

.about > div:last-child {
  border-bottom: none;
}

.about dt {
  color: var(--text-muted);
}

.about dd {
  margin: 0;
  font-weight: 700;
}

.hint {
  margin: 10px 2px 0;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--text-muted);
}
</style>

