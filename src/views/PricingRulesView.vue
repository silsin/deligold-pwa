<template>
  <div class="page" dir="rtl">
    <header class="head">
      <div>
        <h1 class="title">قوانین قیمت‌گذاری</h1>
        <p class="sub">حاشیه خرید و فروش هر نماد روی قیمت زنده (ویژه مدیر کارگزاری)</p>
      </div>
      <button type="button" class="icon-btn material-icons" :class="{ 'is-busy': loadingRules }" :disabled="loadingRules" title="بازآوری" @click="reload">refresh</button>
    </header>

    <p v-if="error" class="msg msg--err">{{ error }}</p>
    <p v-if="okMsg" class="msg msg--ok">{{ okMsg }}</p>

    <div v-if="loadingRules && !rows.length" class="empty">
      <i class="material-icons empty__icon spin">autorenew</i>
      <p class="empty__text">در حال دریافت…</p>
    </div>

    <div v-else-if="!rows.length" class="empty">
      <i class="material-icons empty__icon">price_change</i>
      <p class="empty__text">نمادی برای تنظیم یافت نشد.</p>
    </div>

    <ul v-else class="cards">
      <li v-for="s in rows" :key="s.symbol" class="card" :class="{ 'is-off': !rules[s.symbol].enabled }">
        <div class="card__top">
          <div class="who">
            <b>{{ s.name }}</b>
            <small class="tnum muted">قیمت زنده: {{ faNumber(market.prices[s.symbol] ?? 0) }} تومان</small>
          </div>
          <label class="check check--inline" :title="rules[s.symbol].enabled ? 'فعال' : 'غیرفعال'">
            <input v-model="rules[s.symbol].enabled" type="checkbox" />
            <span class="check__pill" :class="{ 'is-on': rules[s.symbol].enabled }">
              <i class="material-icons">{{ rules[s.symbol].enabled ? 'toggle_on' : 'toggle_off' }}</i>
            </span>
          </label>
        </div>

        <div class="grid">
          <div class="cell">
            <label class="pay__label">خرید — حاشیه (تومان)</label>
            <div class="stepper">
              <button type="button" class="stepper__btn" @click="step(s.symbol, 'buyMarginToman', -100000)">−</button>
              <button type="button" class="stepper__btn" @click="step(s.symbol, 'buyMarginToman', -10000)">−−</button>
              <span class="stepper__val tnum">{{ faNumber(rules[s.symbol].buyMarginToman) }}</span>
              <button type="button" class="stepper__btn stepper__btn--up" @click="step(s.symbol, 'buyMarginToman', 10000)">++</button>
              <button type="button" class="stepper__btn stepper__btn--up" @click="step(s.symbol, 'buyMarginToman', 100000)">+</button>
            </div>
          </div>
          <div class="cell">
            <label class="pay__label">فروش — حاشیه (تومان)</label>
            <div class="stepper">
              <button type="button" class="stepper__btn" @click="step(s.symbol, 'sellMarginToman', -100000)">−</button>
              <button type="button" class="stepper__btn" @click="step(s.symbol, 'sellMarginToman', -10000)">−−</button>
              <span class="stepper__val tnum">{{ faNumber(rules[s.symbol].sellMarginToman) }}</span>
              <button type="button" class="stepper__btn stepper__btn--up" @click="step(s.symbol, 'sellMarginToman', 10000)">++</button>
              <button type="button" class="stepper__btn stepper__btn--up" @click="step(s.symbol, 'sellMarginToman', 100000)">+</button>
            </div>
          </div>
          <div class="cell">
            <label class="pay__label">خرید — درصد</label>
            <div class="stepper">
              <button type="button" class="stepper__btn" @click="step(s.symbol, 'buyMarginPercent', -0.5)">−</button>
              <button type="button" class="stepper__btn" @click="step(s.symbol, 'buyMarginPercent', -0.1)">−−</button>
              <span class="stepper__val tnum">{{ rules[s.symbol].buyMarginPercent }}٪</span>
              <button type="button" class="stepper__btn stepper__btn--up" @click="step(s.symbol, 'buyMarginPercent', 0.1)">++</button>
              <button type="button" class="stepper__btn stepper__btn--up" @click="step(s.symbol, 'buyMarginPercent', 0.5)">+</button>
            </div>
          </div>
          <div class="cell">
            <label class="pay__label">فروش — درصد</label>
            <div class="stepper">
              <button type="button" class="stepper__btn" @click="step(s.symbol, 'sellMarginPercent', -0.5)">−</button>
              <button type="button" class="stepper__btn" @click="step(s.symbol, 'sellMarginPercent', -0.1)">−−</button>
              <span class="stepper__val tnum">{{ rules[s.symbol].sellMarginPercent }}٪</span>
              <button type="button" class="stepper__btn stepper__btn--up" @click="step(s.symbol, 'sellMarginPercent', 0.1)">++</button>
              <button type="button" class="stepper__btn stepper__btn--up" @click="step(s.symbol, 'sellMarginPercent', 0.5)">+</button>
            </div>
          </div>
        </div>

        <div class="toggles">
          <label class="check">
            <input v-model="rules[s.symbol].allowBuy" type="checkbox" />
            <span>اجازه خرید</span>
          </label>
          <label class="check">
            <input v-model="rules[s.symbol].allowSell" type="checkbox" />
            <span>اجازه فروش</span>
          </label>
        </div>

        <div class="preview">
          <div class="preview__cell">
            <small class="muted">قیمت خرید مشتری</small>
            <b class="tnum">{{ preview(s.symbol).buy == null ? 'بسته' : faMoney(preview(s.symbol).buy) }}</b>
          </div>
          <div class="preview__cell">
            <small class="muted">قیمت فروش مشتری</small>
            <b class="tnum">{{ preview(s.symbol).sell == null ? 'بسته' : faMoney(preview(s.symbol).sell) }}</b>
          </div>
        </div>

        <div class="actions">
          <button type="button" class="btn btn--primary btn--sm" :disabled="saving === s.symbol" @click="saveRule(s.symbol)">
            <i class="material-icons">{{ saving === s.symbol ? 'autorenew' : 'save' }}</i>
            {{ saving === s.symbol ? 'در حال ذخیره…' : 'ذخیره قانون' }}
          </button>
          <button type="button" class="btn btn--sm btn--ghost" :disabled="saving === s.symbol" @click="clearRule(s.symbol)">
            <i class="material-icons">restart_alt</i>
            بازگشت به زنده
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useMarketStore } from '../stores/market'
import { api } from '../utils/api.js'
import { faMoney, faNumber } from '../utils/format.js'

const market = useMarketStore()

const loadingRules = ref(false)
const error = ref('')
const okMsg = ref('')
const saving = ref('')

/** Form state keyed by symbol — one entry per tradeable symbol. */
const rules = reactive({})

/** The tradeable symbol catalogue straight from the live board. */
const rows = ref([])

function defaultRule(symbol) {
  return {
    symbol,
    enabled: true,
    allowBuy: true,
    allowSell: true,
    buyMarginToman: 0,
    sellMarginToman: 0,
    buyMarginPercent: 0,
    sellMarginPercent: 0,
  }
}

/**
 * Preview the buy/sell a customer would see, using the same formula the API's
 * `boardForBroker` applies — so the manager sees exactly what they are about
 * to set before they save.
 */
function preview(symbol) {
  const r = rules[symbol]
  const raw = Number(market.prices[symbol] ?? 0) || 0
  if (!r || !raw) return { buy: null, sell: null }

  const buyToman = Number(r.buyMarginToman) || 0
  const sellToman = Number(r.sellMarginToman) || 0
  const buyPct = Number(r.buyMarginPercent) || 0
  const sellPct = Number(r.sellMarginPercent) || 0

  let buy = raw + buyToman + Math.round((raw * buyPct) / 100)
  let sell = raw - sellToman - Math.round((raw * sellPct) / 100)

  if (!r.allowBuy) buy = null
  if (!r.allowSell) sell = null

  // No margin at all and both sides open → no spread (mirrors the API rule).
  if (buyToman === 0 && sellToman === 0 && buyPct === 0 && sellPct === 0 && r.allowBuy && r.allowSell) {
    buy = null
    sell = null
  }
  return { buy, sell }
}

async function loadRules() {
  loadingRules.value = true
  error.value = ''
  okMsg.value = ''
  try {
    const fetched = await api.get('/broker-pricing')
    const bySymbol = {}
    for (const r of Array.isArray(fetched) ? fetched : []) bySymbol[r.symbol] = r

    rows.value = Array.isArray(market.symbols) ? [...market.symbols] : []
    // Reset then repopulate so removed symbols drop out and saved symbols refresh.
    for (const key of Object.keys(rules)) delete rules[key]
    for (const s of rows.value) {
      const r = bySymbol[s.symbol]
      rules[s.symbol] = r
        ? {
            symbol: s.symbol,
            enabled: r.enabled ?? true,
            allowBuy: r.allowBuy ?? true,
            allowSell: r.allowSell ?? true,
            buyMarginToman: Number(r.buyMarginToman) || 0,
            sellMarginToman: Number(r.sellMarginToman) || 0,
            buyMarginPercent: Number(r.buyMarginPercent) || 0,
            sellMarginPercent: Number(r.sellMarginPercent) || 0,
          }
        : defaultRule(s.symbol)
    }
  } catch (e) {
    error.value = e?.message || 'دریافت قوانین قیمت‌گذاری ناموفق بود'
  } finally {
    loadingRules.value = false
  }
}

async function saveRule(symbol) {
  const r = rules[symbol]
  if (!r) return
  saving.value = symbol
  error.value = ''
  okMsg.value = ''
  try {
    const payload = {
      enabled: r.enabled,
      allowBuy: r.allowBuy,
      allowSell: r.allowSell,
      buyMarginToman: Number(r.buyMarginToman) || 0,
      sellMarginToman: Number(r.sellMarginToman) || 0,
      buyMarginPercent: Number(r.buyMarginPercent) || 0,
      sellMarginPercent: Number(r.sellMarginPercent) || 0,
    }
    const saved = await api.put(`/broker-pricing/${symbol}`, payload)
    if (saved?.symbol) {
      Object.assign(rules[symbol], {
        enabled: saved.enabled ?? r.enabled,
        allowBuy: saved.allowBuy ?? r.allowBuy,
        allowSell: saved.allowSell ?? r.allowSell,
        buyMarginToman: Number(saved.buyMarginToman) ?? 0,
        sellMarginToman: Number(saved.sellMarginToman) ?? 0,
        buyMarginPercent: Number(saved.buyMarginPercent) ?? 0,
        sellMarginPercent: Number(saved.sellMarginPercent) ?? 0,
      })
    }
    okMsg.value = 'قانون ذخیره شد.'
  } catch (e) {
    error.value = e?.message || 'ذخیره قانون ناموفق بود'
  } finally {
    saving.value = ''
  }
}

async function clearRule(symbol) {
  if (!confirm('این قانون حذف شود و نماد به قیمت زنده برگردد؟')) return
  saving.value = symbol
  error.value = ''
  okMsg.value = ''
  try {
    await api.delete(`/broker-pricing/${symbol}`)
    Object.assign(rules[symbol], defaultRule(symbol))
    okMsg.value = 'قانون حذف شد؛ نماد به قیمت زنده بازگشت.'
  } catch (e) {
    error.value = e?.message || 'حذف قانون ناموفق بود'
  } finally {
    saving.value = ''
  }
}

function step(symbol, field, delta) {
  const r = rules[symbol]
  if (!r) return
  const current = Number(r[field]) || 0
  // Round to avoid floating point drift on percent fields
  const next = Math.round((current + delta) * 10000) / 10000
  r[field] = next
}

async function reload() {
  await market.fetchMarket({ withChart: false })
  await loadRules()
}

onMounted(async () => {
  // Ensure the symbol catalogue + live prices are present for the preview.
  if (!market.symbols.length) await market.fetchMarket({ withChart: false })
  await loadRules()
})
</script>

<style scoped>
.page { max-width: 620px; margin: 0 auto; padding: 16px 14px 40px; display: flex; flex-direction: column; gap: 12px; }
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.title { margin: 0; font-size: 20px; font-weight: 900; color: var(--accent); }
.sub { margin: 2px 0 0; font-size: 11.5px; color: var(--text-muted); }
.icon-btn { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 10px; background: var(--card); border: 1px solid var(--border); color: var(--text-muted); font-size: 19px; }
.icon-btn.is-busy { opacity: 0.6; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.tnum { font-variant-numeric: tabular-nums; }
.muted { color: var(--text-muted); }

.msg { margin: 0; padding: 9px 11px; border-radius: 10px; font-size: 12.5px; font-weight: 600; }
.msg--err { background: var(--down-soft); color: var(--down); }
.msg--ok { background: var(--up-soft); color: var(--up); }

.cards { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.card { padding: 14px; border-radius: 14px; background: var(--card); border: 1px solid var(--border); display: flex; flex-direction: column; gap: 12px; }
.card.is-off { opacity: 0.72; }
.card__top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.who { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.who b { font-size: 14.5px; }
.who small { font-size: 11.5px; }

.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
.cell { display: flex; flex-direction: column; gap: 5px; }
.stepper { display: flex; align-items: center; gap: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 4px 6px; }
.stepper__val { flex: 1; text-align: center; font-size: 13.5px; font-weight: 800; min-width: 60px; }
.stepper__btn { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 8px; border: 1px solid var(--border); background: var(--card); color: var(--down); font-size: 15px; font-weight: 900; flex-shrink: 0; }
.stepper__btn--up { color: var(--up); }
.stepper__btn:active { opacity: 0.7; }

.pay__label { font-size: 11.5px; font-weight: 700; color: var(--text-muted); }
.pay__input { width: 100%; padding: 11px 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 14px; outline: none; }
.pay__input:focus { border-color: var(--accent); }

.toggles { display: flex; flex-wrap: wrap; gap: 16px; }
.check { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; cursor: pointer; }
.check input { width: 18px; height: 18px; accent-color: var(--accent); }
.check--inline { display: flex; }
.check__pill { display: flex; align-items: center; }
.check__pill .material-icons { font-size: 28px; color: var(--text-muted); }
.check__pill.is-on .material-icons { color: var(--up); }

.preview { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; padding: 11px 12px; border-radius: 11px; background: var(--surface); border: 1px dashed var(--border); }
.preview__cell { display: flex; flex-direction: column; gap: 3px; }
.preview__cell small { font-size: 11px; }
.preview__cell b { font-size: 13.5px; font-weight: 800; color: var(--accent); }

.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.btn { display: flex; align-items: center; justify-content: center; gap: 7px; padding: 10px 16px; border-radius: 11px; border: 1px solid var(--border); background: var(--surface); font-size: 13px; font-weight: 800; white-space: nowrap; }
.btn--primary { background: var(--accent); border-color: var(--accent); color: #14100a; }
.btn--sm { padding: 9px 14px; font-size: 12.5px; }
.btn--ghost { color: var(--text-muted); }
.btn .material-icons { font-size: 18px; }
.btn:disabled { opacity: 0.5; }

.empty { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 32px 18px; border-radius: 14px; border: 1px dashed var(--border); text-align: center; }
.empty__icon { font-size: 34px; color: var(--text-muted); }
.empty__text { margin: 0; font-size: 13px; color: var(--text-muted); }

@media (max-width: 460px) {
  .grid { grid-template-columns: 1fr; }
}
</style>
