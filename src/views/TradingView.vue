<template>
  <div class="tv" dir="rtl">
    <header class="tv__header">
      <button type="button" class="tv__back" aria-label="Ø¨Ø§Ø²Ú¯Ø´Øª Ø¨Ù‡ Ù‚ÛŒÙ…Øªâ€ŒÙ‡Ø§" @click="$router.push('/')">
        <i class="material-icons">chevron_left</i>
      </button>
      <button type="button" class="tv__pairbtn" @click="sheetOpen = true">
        <span class="tv__pair">{{ market.meta?.short ?? market.symbol }}</span>
        <span class="tv__div">/ØªÙˆÙ…Ø§Ù†</span>
        <span class="tv__caret">â–¼</span>
      </button>
      <div class="tv__pricebox">
        <div class="tv__price" :class="market.isUp ? 'is-up' : 'is-down'">
          {{ faMoney(market.price) }}
        </div>
        <div class="tv__chg" :class="market.isUp ? 'is-up' : 'is-down'">
          {{ faDelta(market.change) }} ({{ faPercent(market.changePercent) }})
        </div>
      </div>
    </header>

    <section class="tv__chartwrap">
      <PriceChart :candles="market.candles" :ticks="market.ticks" :range="market.range" :mode="mode" />
      <div v-if="market.loading && market.candles.length === 0" class="tv__empty">
        Ø¯Ø± Ø­Ø§Ù„ Ø¯Ø±ÛŒØ§ÙØª Ù†Ù…ÙˆØ¯Ø§Ø±â€¦
      </div>
      <div v-else-if="market.candles.length === 0" class="tv__empty">
        ØªØ§Ø±ÛŒØ®Ú†Ù‡â€ŒØ§ÛŒ Ø¨Ø±Ø§ÛŒ Ø§ÛŒÙ† Ù†Ù…Ø§Ø¯ Ø«Ø¨Øª Ù†Ø´Ø¯Ù‡ â€” Ø¨Ø§ Ø§ÙˆÙ„ÛŒÙ† Ø¯Ø§Ø¯Ù‡â€ŒÙ‡Ø§ Ù†Ù…ÙˆØ¯Ø§Ø± Ø³Ø§Ø®ØªÙ‡ Ù…ÛŒâ€ŒØ´ÙˆØ¯.
      </div>
    </section>

    <section class="tv__of">
      <div class="tv__oftab" role="tablist" aria-label="Ù†ÙˆØ¹ Ù…Ø¹Ø§Ù…Ù„Ù‡">
        <button
          type="button"
          class="tv__oftabbtn"
          :class="{ 'is-on': side === 'BUY' }"
          role="tab"
          :aria-selected="side === 'BUY'"
          @click="side = 'BUY'"
        >
          Ø®Ø±ÛŒØ¯
        </button>
        <button
          type="button"
          class="tv__oftabbtn"
          :class="{ 'is-on': side === 'SELL' }"
          role="tab"
          :aria-selected="side === 'SELL'"
          @click="side = 'SELL'"
        >
          ÙØ±ÙˆØ´
        </button>
      </div>

      <div class="tv__ofamount">
        <input
          v-model="amount"
          type="number"
          inputmode="decimal"
          min="0"
          step="any"
          placeholder="Ù…Ù‚Ø¯Ø§Ø± Ø±Ø§ ÙˆØ§Ø±Ø¯ Ú©Ù†ÛŒØ¯"
          class="tv__amount"
          :disabled="submitting || !amount"
          @keyup.enter="submitOrder"
        />
        <span class="tv__unit">Ú¯Ø±Ù…</span>
      </div>

      <button
        type="button"
        class="tv__submit"
        :disabled="!amount || submitting"
        @click="submitOrder"
      >
        <span v-if="side === 'BUY'">
          <i class="material-icons">trending_up</i>
          Ø®Ø±ÛŒØ¯
        </span>
        <span v-else>
          <i class="material-icons">trending_down</i>
          ÙØ±ÙˆØ´
        </span>
      </button>

      <p v-if="orderError" class="tv__msg tv__msg--err">{{ orderError }}</p>
      <p v-if="orderSuccess" class="tv__msg tv__msg--ok">{{ orderSuccess }}</p>
    </section>

    <MarketSheet
      v-if="sheetOpen"
      :symbols="market.symbols"
      :prices="market.prices"
      :stats="market.stats"
      :current="market.symbol"
      :direction="market.direction"
      @close="sheetOpen = false"
      @select="onSelect"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useMarketStore } from '../stores/market'
import { useAuthStore } from '../stores/auth'
import PriceChart from '../components/PriceChart.vue'
import MarketSheet from '../components/MarketSheet.vue'
import { faMoney, faDelta, faPercent } from '../utils/format'

const market = useMarketStore()
const auth = useAuthStore()
const router = useRouter()

const side = ref('BUY')
const amount = ref('')
const submitting = ref(false)
const orderError = ref('')
const orderSuccess = ref('')
const sheetOpen = ref(false)
const mode = ref(localStorage.getItem('dg_trade_chart_mode') || 'candle')

function onModeChanged(e) {
  mode.value = e.detail || 'candle'
}

async function onSelect(sym) {
  sheetOpen.value = false
  await market.setSymbol(sym)
}

async function submitOrder() {
  orderError.value = ''
  orderSuccess.value = ''
  if (!auth.isLoggedIn) {
    orderError.value = 'Ø¨Ø±Ø§ÛŒ Ù…Ø¹Ø§Ù…Ù„Ù‡ Ø§Ø¨ØªØ¯Ø§ ÙˆØ§Ø±Ø¯ Ø­Ø³Ø§Ø¨ Ø´ÙˆÛŒØ¯'
    return
  }
  submitting.value = true
  try {
    const result = await auth.placeOrder({
      symbol: market.symbol,
      side: side.value,
      grams: parseFloat(amount.value),
    })
    if (!result.ok) {
      orderError.value = result.error || 'Ø«Ø¨Øª Ø³ÙØ§Ø±Ø´ Ù†Ø§Ù…ÙˆÙÙ‚ Ø¨ÙˆØ¯'
      return
    }
    const order = result.order
    orderSuccess.value =
      side.value === 'BUY'
        ? `Ø®Ø±ÛŒØ¯ ${order?.grams ?? amount.value} Ú¯Ø±Ù… Ø¨Ø§ Ù‚ÛŒÙ…Øª ${faMoney(order?.price ?? 'â€”')} Ø«Ø¨Øª Ø´Ø¯`
        : `ÙØ±ÙˆØ´ ${order?.grams ?? amount.value} Ú¯Ø±Ù… Ø¨Ø§ Ù‚ÛŒÙ…Øª ${faMoney(order?.price ?? 'â€”')} Ø«Ø¨Øª Ø´Ø¯`
    if (order) {
      orderSuccess.value += ` (Ú©Ø§Ø±Ù…Ø²Ø¯ ${faMoney(order.fee ?? 0)})`
    }
    amount.value = ''
    await auth.fetchAccount()
  } catch (e) {
    orderError.value = e.message || 'Ø«Ø¨Øª Ø³ÙØ§Ø±Ø´ Ù†Ø§Ù…ÙˆÙÙ‚ Ø¨ÙˆØ¯'
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  window.addEventListener('dg-chart-mode', onModeChanged)
  void market.fetchMarket({ record: true })
  void market.fetchStats()
  market.startPolling(15000)
  if (auth.isLoggedIn) void auth.fetchAccount()
})

onBeforeUnmount(() => {
  window.removeEventListener('dg-chart-mode', onModeChanged)
  market.stopPolling()
})
</script>

<style scoped>
/* Base */
.tv {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 10px 12px 28px;
  max-width: 720px;
  margin: 0 auto;
  font-variant-numeric: tabular-nums;
}

/* Header */
.tv__header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tv__back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--card);
  border: 1px solid var(--border);
  font-size: 20px;
  color: var(--text);
  cursor: pointer;
  transition: background 0.15s ease;
}

.tv__back:hover {
  background: var(--surface);
}

.tv__back i {
  font-size: 20px;
}

.tv__pairbtn {
  display: flex;
  align-items: baseline;
  gap: 5px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--card);
  border: 1px solid var(--border);
  text-align: right;
  cursor: pointer;
}

.tv__pair {
  font-size: 18px;
  font-weight: 900;
  color: var(--text);
}

.tv__div {
  font-size: 12px;
  color: var(--text-muted);
}

.tv__caret {
  font-size: 11px;
  color: var(--accent);
}

.tv__pricebox {
  margin-left: 10px;
  flex: 1 1 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
}

.tv__price {
  font-size: 26px;
  font-weight: 900;
}

.tv__chg {
  font-size: 13px;
  font-weight: 700;
}

.is-up {
  color: var(--up);
}

.is-down {
  color: var(--down);
}

/* Chart */
.tv__chartwrap {
  position: relative;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--card);
  overflow: hidden;
  min-height: 280px;
}

.tv__empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  text-align: center;
  font-size: 12.5px;
  color: var(--text-muted);
  background: color-mix(in srgb, var(--card) 82%, transparent);
}

/* Order form */
.tv__of {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
}

.tv__oftab {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 4px;
}

.tv__oftabbtn {
  padding: 11px 0;
  border-radius: 7px;
  background: transparent;
  border: 0;
  color: var(--text-muted);
  font-size: 14.5px;
  font-weight: 800;
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
  text-align: center;
}

.tv__oftabbtn.is-on {
  color: #fff;
  background: var(--accent);
}

.tv__oftabbtn:not(.is-on):active {
  transform: scale(0.97);
}

.tv__ofamount {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 2px;
}

.tv__amount {
  flex: 1;
  min-width: 0;
  border: 0;
  background: none;
  outline: none;
  color: var(--text);
  font-size: 17px;
  font-weight: 800;
  padding: 10px 2px;
  text-align: right;
}

.tv__amount:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tv__unit {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 700;
  white-space: nowrap;
}

.tv__submit {
  position: relative;
  width: 100%;
  margin-top: 2px;
  padding: 14px 0;
  border-radius: 9px;
  background: var(--accent);
  color: #fff;
  font-size: 15.5px;
  font-weight: 900;
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.1s ease;
  text-align: center;
}

.tv__submit:hover:not(:disabled) {
  opacity: 0.92;
}

.tv__submit:active:not(:disabled) {
  transform: scale(0.99);
}

.tv__submit:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.tv__submit i {
  margin-left: 6px;
}

.tv__msg {
  margin: 0;
  padding: 9px 11px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.6;
}

.tv__msg--ok {
  background: var(--up-soft);
  color: var(--up);
}

.tv__msg--err {
  background: var(--down-soft);
  color: var(--down);
}
</style>
