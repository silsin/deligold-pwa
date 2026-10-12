<template>
  <div class="bn">
    <!-- Pair header — Binance symbol bar -->
    <div class="bn__pairbar">
      <button type="button" class="bn__back" aria-label="بازگشت به قیمت‌ها" @click="$router.push('/')">→</button>
      <button class="pair" type="button" @click="sheetOpen = true">
        <span class="pair__sym">{{ market.meta?.short ?? market.symbol }}</span>
        <span class="pair__quote">/تومان</span>
        <span class="pair__caret">▾</span>
      </button>
      <div class="bn__pricewrap">
        <div class="bn__price" :class="market.isUp ? 'is-up' : 'is-down'">
          {{ faMoney(market.price) }}
        </div>
        <div class="bn__change" :class="market.isUp ? 'is-up' : 'is-down'">
          {{ faDelta(market.change) }} ({{ faPercent(market.changePercent) }})
        </div>
      </div>
    </div>

    <!-- Stat strip — Binance 24h row -->
    <div class="stats">
      <div class="stats__cell">
        <small>بیشترین ۲۴ ساعت</small>
        <b>{{ faMoney(market.rangeHigh) }}</b>
      </div>
      <div class="stats__cell">
        <small>کمترین ۲۴ ساعت</small>
        <b>{{ faMoney(market.rangeLow) }}</b>
      </div>
      <div class="stats__cell">
        <small>بازگشایی</small>
        <b>{{ faMoney(market.rangeOpen) }}</b>
      </div>
      <div class="stats__cell">
        <small>منبع</small>
        <b :class="market.stale ? 'is-down' : 'is-up'">{{ market.stale ? 'کش قدیمی' : 'زنده' }}</b>
      </div>
    </div>
    <p v-if="market.isRangeFallback" class="stats__note">
      آمار ۲۴ ساعته هنوز جمع‌آوری نشده — تغییر بر اساس بازه نمودار است.
    </p>

    <!-- Range chips -->
    <div class="ranges">
      <button
        v-for="r in market.ranges"
        :key="r"
        type="button"
        class="chip"
        :class="{ 'chip--on': market.range === r }"
        @click="market.setRange(r)"
      >
        {{ rangeLabel(r) }}
      </button>
    </div>

    <!-- Chart -->
    <div class="chart-wrap">
      <PriceChart :candles="market.candles" :ticks="market.ticks" :range="market.range" :mode="mode" />
      <div v-if="market.loading && market.candles.length === 0" class="chart-empty">در حال دریافت نمودار…</div>
      <div v-else-if="market.candles.length === 0" class="chart-empty">
        تاریخچه‌ای برای این نماد ثبت نشده — با اولین داده‌ها نمودار ساخته می‌شود.
      </div>
    </div>

    <!-- Order book (Binance depth) -->
    <section class="card book-card">
      <div class="card__head">
        <strong>دفتر سفارش</strong>
        <span class="card__sub">قیمت (تومان) · مقدار ({{ market.meta?.unit ?? 'گرم' }})</span>
      </div>
      <OrderBook :price="market.price" :meta="market.meta" @pick="pickPrice" />
      <p v-if="pickedPrice" class="book-card__pick">
        قیمت انتخابی از دفتر: {{ faMoney(pickedPrice) }} — اجرا به قیمت بازار
      </p>
    </section>

    <!-- Order form — Binance spot panel -->
    <section class="card of" :style="{ '--side': side === 'BUY' ? 'var(--up)' : 'var(--down)', '--side-soft': side === 'BUY' ? 'var(--up-soft)' : 'var(--down-soft)' }">
      <div class="of__sides" role="tablist" aria-label="نوع معامله">
        <span class="of__thumb" :class="{ 'is-sell': side === 'SELL' }" aria-hidden="true"></span>
        <button
          type="button"
          class="of__side"
          :class="{ 'is-on': side === 'BUY' }"
          role="tab"
          :aria-selected="side === 'BUY'"
          @click="side = 'BUY'"
        >
          <i class="material-icons">trending_up</i><span>خرید</span>
        </button>
        <button
          type="button"
          class="of__side"
          :class="{ 'is-on': side === 'SELL' }"
          role="tab"
          :aria-selected="side === 'SELL'"
          @click="side = 'SELL'"
        >
          <i class="material-icons">trending_down</i><span>فروش</span>
        </button>
      </div>

      <div class="of__types">
        <button type="button" class="of__type is-on">بازار</button>
        <button type="button" class="of__type" disabled title="به‌زودی">محدود</button>
        <button type="button" class="of__type" disabled title="به‌زودی">حد ضرر</button>
      </div>

      <template v-if="!auth.isLoggedIn">
        <p class="of__gate">برای معامله ابتدا وارد حساب شوید.</p>
        <button type="button" class="of__login" @click="openLogin('register')">ورود / ثبت‌نام</button>
      </template>

      <template v-else>
        <div class="of__row">
          <span>موجودی</span>
          <b>{{ side === 'BUY' ? faMoney(auth.wallet?.balance ?? 0) : `${faWeight(held)} ${market.meta?.unit ?? 'گرم'}` }}</b>
        </div>

        <label class="of__field">
          <span>مقدار ({{ market.meta?.unit ?? 'گرم' }})</span>
          <div class="of__input">
            <input v-model="amount" inputmode="decimal" placeholder="0" @input="percent = 0" />
            <i>{{ market.meta?.unit ?? 'گرم' }}</i>
          </div>
        </label>

        <div class="slider">
          <input v-model.number="percent" type="range" min="0" max="100" step="1" class="slider__range" @input="applyPercent" />
          <div class="slider__pcts">
            <button
              v-for="p in pcts"
              :key="p"
              type="button"
              :class="{ 'is-on': percent === p }"
              @click="setPercent(p)"
            >
              {{ toFa(p) }}٪
            </button>
          </div>
        </div>

        <div class="of__row"><span>قیمت معامله</span><b>{{ faMoney(execPrice) }}</b></div>
        <div class="of__row"><span>کارمزد ({{ faPercent(auth.feePercent, 1) }})</span><b>{{ faMoney(orderFee) }}</b></div>
        <div class="of__row of__row--total">
          <span>{{ side === 'BUY' ? 'جمع پرداختی' : 'جمع دریافتی' }}</span>
          <b>{{ faMoney(netTotal) }}</b>
        </div>

        <div v-if="side === 'BUY' && !auth.isVerified" class="of__row">
          <span>نحوه تحویل</span>
          <b>
            <label style="margin-inline-end: 12px"><input v-model="fulfillment" type="radio" value="PICKUP" /> حضوری</label>
            <label><input v-model="fulfillment" type="radio" value="DELIVERY" /> پستی</label>
          </b>
        </div>
        <label v-if="side === 'BUY' && !auth.isVerified && fulfillment === 'DELIVERY'" class="of__field">
          <span>آدرس تحویل</span>
          <div class="of__input"><input v-model="deliveryAddress" placeholder="آدرس کامل پستی" /></div>
        </label>

        <p v-if="orderError" class="of__msg is-err">{{ orderError }}</p>
        <p v-if="orderSuccess" class="of__msg is-ok">{{ orderSuccess }}</p>

        <div v-if="pendingReceipt" class="of__field">
          <span>رسید بانکی سفارش {{ pendingReceipt.ref }} ({{ pendingReceipt.status }})</span>
          <div class="of__input"><input type="file" accept="image/*,.pdf" @change="onReceiptFile" /></div>
          <div class="of__input" style="margin-top: 6px"><input v-model="receiptNote" placeholder="توضیح رسید (اختیاری)" /></div>
          <button type="button" class="of__submit is-buy" :disabled="receiptBusy" style="margin-top: 8px" @click="submitReceiptForm">
            <span class="of__submit-in"><span>{{ receiptBusy ? 'در حال ارسال…' : 'ارسال رسید' }}</span></span>
          </button>
        </div>

        <button
          type="button"
          class="of__submit"
          :class="side === 'BUY' ? 'is-buy' : 'is-sell'"
          :disabled="!canSubmit || submitting"
          @click="submit"
        >
          <span class="of__submit-in">
            <i class="material-icons">{{ side === 'BUY' ? 'trending_up' : 'trending_down' }}</i>
            <span>{{ submitting ? 'در حال ثبت…' : `${side === 'BUY' ? 'خرید' : 'فروش'} ${market.meta?.short ?? ''}` }}</span>
          </span>
        </button>
      </template>
    </section>

    <!-- Positions -->
    <section class="card">
      <div class="card__head"><strong>دارایی‌های من</strong></div>
      <div class="wallet">
        <div class="wallet__item">
          <small>موجودی</small>
          <strong>{{ faMoney(auth.wallet?.balance ?? 0) }}</strong>
        </div>
        <div class="wallet__item">
          <small>ارزش کل</small>
          <strong class="is-accent">{{ faMoney(auth.equity) }}</strong>
        </div>
        <div class="wallet__item">
          <small>سود/زیان باز</small>
          <strong :class="auth.totalPnl >= 0 ? 'is-up' : 'is-down'">{{ faDelta(auth.totalPnl) }}</strong>
        </div>
      </div>

      <div v-if="auth.positions.length === 0" class="empty">پوزیشن بازی ندارید.</div>
      <table v-else class="table">
        <thead>
          <tr>
            <th>نماد</th>
            <th>مقدار</th>
            <th>میانگین</th>
            <th>سود/زیان</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in auth.positions" :key="p.symbol">
            <td class="sym">{{ p.symbol }}</td>
            <td class="num">{{ faWeight(p.grams) }} گرم</td>
            <td class="num">{{ faMoney(p.avgCost) }}</td>
            <td class="num" :class="p.pnl >= 0 ? 'is-up' : 'is-down'">{{ faDelta(p.pnl) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Recent orders -->
    <section class="card">
      <div class="card__head"><strong>سفارش‌های اخیر</strong></div>
      <div v-if="auth.orders.length === 0" class="empty">سفارشی ثبت نشده است.</div>
      <table v-else class="table">
        <thead>
          <tr>
            <th>نماد</th>
            <th>نوع</th>
            <th>مقدار</th>
            <th>قیمت</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="o in auth.orders.slice(0, 8)" :key="o.id">
            <td class="sym">{{ o.symbol }}</td>
            <td>
              <span class="badge" :class="o.side === 'BUY' ? 'is-buy' : 'is-sell'">
                {{ o.side === 'BUY' ? 'خرید' : 'فروش' }}
              </span>
            </td>
            <td class="num">{{ faWeight(o.grams) }} گرم</td>
            <td class="num">{{ faMoney(o.price) }}</td>
          </tr>
        </tbody>
      </table>
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
import { api } from '../utils/api.js'
import PriceChart from '../components/PriceChart.vue'
import OrderBook from '../components/OrderBook.vue'
import MarketSheet from '../components/MarketSheet.vue'
import { faMoney, faWeight, faDelta, faPercent, toFa } from '../utils/format'

const market = useMarketStore()
const auth = useAuthStore()
const router = useRouter()

const side = ref('BUY')
const amount = ref('')
const percent = ref(0)
const pcts = [0, 25, 50, 75, 100]
const submitting = ref(false)
const orderError = ref('')
const orderSuccess = ref('')
// Manual (receipt) flow: unverified buys land in AWAITING_RECEIPT.
const pendingReceipt = ref(null)
const receiptFile = ref(null)
const receiptNote = ref('')
const fulfillment = ref('PICKUP')
const deliveryAddress = ref('')
const receiptBusy = ref(false)
const sheetOpen = ref(false)
const pickedPrice = ref(null)
const mode = ref(localStorage.getItem('dg_trade_chart_mode') || 'candle')

// Keep the chart preference in sync when it is changed in Settings.
function onModeChanged(e) {
  mode.value = e.detail || 'candle'
}

const RANGE_LABELS = { '1h': '۱ ساعت', '24h': '۲۴ ساعت', '7d': '۷ روز', '30d': '۳۰ روز' }

function rangeLabel(r) {
  return RANGE_LABELS[r] ?? r
}

/** Position for the current symbol (what a SELL can cover). */
const held = computed(() => auth.positionOf(market.symbol)?.grams ?? 0)

const grams = computed(() => {
  const parsed = parseFloat(String(amount.value).replace(/[^\d.]/g, ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
})

const execPrice = computed(() => {
  // akbari-style: each side fills at its own quote when the source carries
  // margins; otherwise the single base price (fee model then applies).
  const quotes = side.value === 'BUY' ? market.buys : market.sells
  return quotes?.[market.symbol] ?? market.price
})

const orderTotal = computed(() => Math.round(grams.value * execPrice.value))
const orderFee = computed(() => Math.round((orderTotal.value * (auth.feePercent || 0)) / 100))
const netTotal = computed(() =>
  side.value === 'BUY' ? orderTotal.value + orderFee.value : orderTotal.value - orderFee.value
)

const canSubmit = computed(
  () =>
    !submitting.value &&
    auth.isLoggedIn &&
    grams.value > 0 &&
    execPrice.value > 0 &&
    !market.loading &&
    (side.value === 'BUY' || held.value >= grams.value)
)

/** Fill amount from a balance/holding percentage (Binance slider behaviour). */
function setPercent(p) {
  percent.value = p
  applyPercent()
}

function applyPercent() {
  const p = Number(percent.value) || 0
  if (p <= 0 || execPrice.value <= 0) return
  if (side.value === 'BUY') {
    const maxGrams = (auth.balance * (p / 100)) / (execPrice.value * (1 + (auth.feePercent || 0) / 100))
    amount.value = maxGrams > 0 ? maxGrams.toFixed(3) : ''
  } else {
    amount.value = (held.value * (p / 100)).toFixed(3)
  }
}

function needsReceipt(order) {
  return order && (order.kind === 'MANUAL' || order.status === 'AWAITING_RECEIPT')
}

async function submit() {
  orderError.value = ''
  orderSuccess.value = ''
  pendingReceipt.value = null
  if (!auth.isLoggedIn) {
    orderError.value = 'برای معامله ابتدا وارد حساب شوید'
    return
  }
  if (side.value === 'BUY' && !auth.isVerified) {
    if (!fulfillment.value) fulfillment.value = 'PICKUP'
    if (fulfillment.value === 'DELIVERY' && !deliveryAddress.value.trim()) {
      orderError.value = 'برای ارسال پستی، آدرس تحویل الزامی است'
      return
    }
  }
  submitting.value = true
  try {
    const payload = { symbol: market.symbol, side: side.value, grams: grams.value }
    // Unverified buys go through the receipt flow with a fulfillment choice.
    if (side.value === 'BUY' && !auth.isVerified) {
      payload.fulfillment = fulfillment.value
      if (fulfillment.value === 'DELIVERY') payload.deliveryAddress = deliveryAddress.value.trim()
    }
    const result = await auth.placeOrder(payload)
    if (!result.ok) {
      orderError.value = result.error || 'ثبت سفارش ناموفق بود'
      return
    }
    const order = result.order
    if (needsReceipt(order)) {
      pendingReceipt.value = order
      orderSuccess.value = `سفارش ${order.ref ?? ''} ثبت شد — رسید بانکی را بارگذاری کنید تا بررسی شود`
    } else {
      orderSuccess.value =
        side.value === 'BUY'
          ? `خرید ${faWeight(grams.value)} ${market.meta?.unit ?? 'گرم'} با قیمت ${faMoney(order?.price ?? execPrice.value)} ثبت شد`
          : `فروش ${faWeight(grams.value)} ${market.meta?.unit ?? 'گرم'} با قیمت ${faMoney(order?.price ?? execPrice.value)} ثبت شد`
      if (order) {
        orderSuccess.value += ` (کارمزد ${faMoney(order.fee ?? 0)} · مبلغ ${faMoney(order.amount ?? 0)} · ${order.ref ?? ''})`
      }
      amount.value = ''
      percent.value = 0
    }
    await auth.fetchAccount()
  } catch (e) {
    orderError.value = e.message || 'ثبت سفارش ناموفق بود'
  } finally {
    submitting.value = false
  }
}

function onReceiptFile(e) {
  receiptFile.value = e?.target?.files?.[0] ?? null
}

async function submitReceiptForm() {
  orderError.value = ''
  orderSuccess.value = ''
  const order = pendingReceipt.value
  if (!order?.id) {
    orderError.value = 'سفارشی برای ارسال رسید انتخاب نشده است'
    return
  }
  if (!receiptFile.value) {
    orderError.value = 'فایل رسید را انتخاب کنید'
    return
  }
  if (fulfillment.value === 'DELIVERY' && !deliveryAddress.value.trim()) {
    orderError.value = 'برای ارسال پستی، آدرس تحویل الزامی است'
    return
  }
  receiptBusy.value = true
  try {
    const form = new FormData()
    form.append('file', receiptFile.value)
    let receiptPath = ''
    try {
      const up = await api.post('/uploads', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      receiptPath = up?.path ?? up?.url ?? up?.filePath ?? up?.file?.path ?? ''
    } catch (e) {
      orderError.value = e.message || 'بارگذاری رسید ناموفق بود'
      return
    }
    if (!receiptPath) {
      orderError.value = 'بارگذاری رسید ناموفق بود'
      return
    }
    const payload = {
      receiptPath,
      receiptNote: receiptNote.value.trim(),
      fulfillment: fulfillment.value,
    }
    if (fulfillment.value === 'DELIVERY') payload.deliveryAddress = deliveryAddress.value.trim()
    const result = await auth.submitReceipt(order.id, payload)
    if (!result.ok) {
      orderError.value = result.error || 'ارسال رسید ناموفق بود'
      return
    }
    const updated = result.order ?? null
    orderSuccess.value = `رسید سفارش ${updated?.ref ?? order.ref ?? ''} ارسال شد و در صف بررسی قرار گرفت`
    pendingReceipt.value = null
    receiptFile.value = null
    receiptNote.value = ''
    await auth.fetchAccount()
  } catch (e) {
    orderError.value = e.message || 'ارسال رسید ناموفق بود'
  } finally {
    receiptBusy.value = false
  }
}

/** Book price tap — reference only, orders fill at market. */
function pickPrice(p) {
  pickedPrice.value = p
}

async function onSelect(sym) {
  sheetOpen.value = false
  pickedPrice.value = null
  await market.setSymbol(sym)
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
.bn {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 10px 12px 30px;
  max-width: 960px;
  margin: 0 auto;
  font-variant-numeric: tabular-nums;
}

.bn__back {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--card);
  border: 1px solid var(--border);
  font-size: 17px;
  color: var(--text);
}

/* ── Pair header ── */
.bn__pairbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.pair {
  display: flex;
  align-items: baseline;
  gap: 5px;
  padding: 7px 10px;
  border-radius: 8px;
  background: var(--card);
  border: 1px solid var(--border);
}

.pair__sym {
  font-size: 17px;
  font-weight: 900;
  color: var(--text);
}

.pair__quote {
  font-size: 12px;
  color: var(--text-muted);
}

.pair__caret {
  font-size: 11px;
  color: var(--accent);
}

.bn__pricewrap {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.bn__price {
  font-size: 23px;
  font-weight: 900;
}

.bn__change {
  font-size: 13.5px;
  font-weight: 800;
}

/* ── Stat strip ── */
.stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.stats__cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 9px;
  border-radius: 8px;
  background: var(--card);
  border: 1px solid var(--border);
  min-width: 0;
}

.stats__cell small {
  font-size: 9.5px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stats__cell b {
  font-size: 12.5px;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stats__note {
  margin: -4px 2px 0;
  font-size: 11px;
  color: var(--text-muted);
}

/* ── Ranges ── */
.ranges {
  display: flex;
  gap: 5px;
}

.chip {
  padding: 6px 13px;
  border-radius: 7px;
  background: var(--card);
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
}

.chip--on {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  border-color: var(--accent);
  color: var(--accent);
}

/* ── Chart ── */
.chart-wrap {
  position: relative;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--card);
  overflow: hidden;
  height: 320px;
}

.chart-empty {
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

/* ── Cards ── */
.card {
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--card);
  padding: 10px;
}

.card__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 2px 8px;
  font-size: 13.5px;
}

.card__sub {
  font-size: 10.5px;
  color: var(--text-muted);
}

.book-card__pick {
  margin: 7px 2px 0;
  font-size: 11.5px;
  color: var(--accent);
}

/* ── Order form ── */
/* Segmented buy/sell switch: the pill is a real element that slides, so the
   direction change is felt rather than just read. */
.of__sides {
  position: relative;
  display: grid;
  /* minmax(0, 1fr) — NOT 1fr. A bare `1fr` means `minmax(auto, 1fr)`, whose auto
     floor is min-content, so the wider label (فروش) would steal width from خرید. */
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 6px;
  margin-bottom: 10px;
  padding: 4px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
}

.of__thumb {
  position: absolute;
  top: 4px;
  bottom: 4px;
  inset-inline-start: 4px;
  width: calc(50% - 7px);
  border-radius: 9px;
  background: var(--up);
  box-shadow: 0 8px 18px -10px var(--up);
  transition: transform 0.3s cubic-bezier(0.34, 1.4, 0.5, 1), background-color 0.24s ease,
    box-shadow 0.24s ease;
}

.of__thumb.is-sell {
  transform: translateX(calc(-100% - 6px));
  background: var(--down);
  box-shadow: 0 8px 18px -10px var(--down);
}

.of__side {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 11px 0;
  border-radius: 9px;
  background: transparent;
  border: 0;
  color: var(--text-muted);
  font-size: 14.5px;
  font-weight: 800;
  transition: color 0.2s ease, transform 0.12s ease;
}

.of__side .material-icons {
  font-size: 18px;
}

.of__side.is-on {
  color: #fff;
}

.of__side:not(.is-on):active {
  transform: scale(0.97);
}

.of__types {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}

.of__type {
  padding: 6px 14px;
  border-radius: 7px;
  background: var(--surface);
  color: var(--text-muted);
  font-size: 12.5px;
  font-weight: 700;
}

.of__type.is-on {
  background: color-mix(in srgb, var(--side, var(--accent)) 16%, transparent);
  color: var(--side, var(--accent));
}

.of__type:disabled {
  opacity: 0.45;
}

.of__gate {
  margin: 6px 0 10px;
  text-align: center;
  font-size: 13.5px;
  color: var(--text-muted);
}

.of__login {
  width: 100%;
  padding: 12px 0;
  border-radius: 9px;
  background: var(--accent);
  color: #fff;
  font-size: 14.5px;
  font-weight: 800;
}

.of__row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 2px;
  font-size: 13px;
}

.of__row span {
  color: var(--text-muted);
}

.of__row b {
  font-weight: 800;
}

.of__row--total {
  margin-top: 3px;
  padding-top: 10px;
  border-top: 1px dashed var(--border);
  font-size: 15px;
}

.of__row--total b {
  color: var(--side, var(--accent));
}

.of__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 6px 0 12px;
  font-size: 12.5px;
  color: var(--text-muted);
}

.of__input {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
}

.of__input:focus-within {
  border-color: var(--accent);
}

.of__input input {
  flex: 1;
  min-width: 0;
  border: none;
  background: none;
  outline: none;
  color: var(--text);
  font-size: 17px;
  font-weight: 800;
}

.of__input i {
  font-style: normal;
  font-size: 12px;
  color: var(--text-muted);
}

/* ── Percentage slider ── */
.slider {
  margin-bottom: 10px;
}

.slider__range {
  width: 100%;
  height: 4px;
  appearance: none;
  -webkit-appearance: none;
  background: var(--border);
  border-radius: 999px;
  outline: none;
}

.slider__range::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent);
  border: 3px solid var(--card);
  box-shadow: 0 0 0 1px var(--accent);
  cursor: pointer;
}

.slider__range::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid var(--card);
  cursor: pointer;
}

.slider__pcts {
  display: flex;
  justify-content: space-between;
  margin-top: 7px;
}

.slider__pcts button {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  padding: 4px 8px;
  border-radius: 6px;
}

.slider__pcts button.is-on {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}

.of__msg {
  margin: 9px 0 0;
  padding: 9px 11px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.6;
}

.of__msg.is-ok {
  background: var(--up-soft);
  color: var(--up);
}

.of__msg.is-err {
  background: var(--down-soft);
  color: var(--down);
}

/* The primary action gets the whole panel's colour: gradient, glow and a slow
   sheen sweep so it reads as the one thing worth tapping. */
.of__submit {
  position: relative;
  width: 100%;
  margin-top: 13px;
  padding: 15px 0;
  border-radius: 12px;
  font-size: 15.5px;
  font-weight: 900;
  overflow: hidden;
  isolation: isolate;
  transition: transform 0.12s ease, box-shadow 0.24s ease, opacity 0.2s ease;
}

.of__submit-in {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.of__submit .material-icons {
  font-size: 21px;
}

.of__submit.is-buy {
  background: linear-gradient(135deg, var(--up) 0%, color-mix(in srgb, var(--up) 62%, #000) 100%);
  color: #fff;
  box-shadow: 0 12px 26px -14px var(--up), inset 0 1px 0 rgba(255, 255, 255, 0.22);
}

.of__submit.is-sell {
  background: linear-gradient(135deg, var(--down) 0%, color-mix(in srgb, var(--down) 62%, #000) 100%);
  color: #fff;
  box-shadow: 0 12px 26px -14px var(--down), inset 0 1px 0 rgba(255, 255, 255, 0.22);
}

.of__submit:not(:disabled):active {
  transform: scale(0.985);
}

.of__submit:disabled {
  opacity: 0.45;
  box-shadow: none;
}

/* Sheen sweep — runs only while the button is live, never while submitting. */
.of__submit:not(:disabled)::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(100deg, transparent 25%, rgba(255, 255, 255, 0.22) 50%, transparent 75%);
  transform: translateX(-120%);
  animation: of-sheen 4.2s ease-in-out infinite;
  pointer-events: none;
}

@keyframes of-sheen {
  0%,
  58% {
    transform: translateX(-120%);
  }
  92%,
  100% {
    transform: translateX(120%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .of__submit:not(:disabled)::after {
    animation: none;
  }
  .of__thumb {
    transition: background-color 0.24s ease;
  }
}

/* ── Wallet + tables ── */
.wallet {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
  margin-bottom: 11px;
}

.wallet__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 8px;
  border-radius: 8px;
  background: var(--surface);
  text-align: center;
  min-width: 0;
}

.wallet__item small {
  font-size: 10px;
  color: var(--text-muted);
}

.wallet__item strong {
  font-size: 13px;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

.table th,
.table td {
  padding: 9px 6px;
  text-align: right;
  border-bottom: 1px solid var(--border);
}

.table thead th {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
}

.table tbody tr:last-child td {
  border-bottom: none;
}

.sym {
  font-weight: 800;
}

.num {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.badge {
  padding: 3px 9px;
  border-radius: 6px;
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

.empty {
  padding: 16px 0;
  text-align: center;
  font-size: 12.5px;
  color: var(--text-muted);
}

.is-up {
  color: var(--up);
}

.is-down {
  color: var(--down);
}

.is-accent {
  color: var(--accent);
}

/* Desktop: chart + order form side by side, Binance-style. */
@media (min-width: 860px) {
  .bn {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    grid-template-areas:
      'pair pair'
      'stats stats'
      'ranges ranges'
      'chart of'
      'book of'
      'wallet wallet'
      'orders orders';
    align-items: start;
  }

  .bn__pairbar { grid-area: pair; }
  .stats { grid-area: stats; }
  .ranges { grid-area: ranges; }
  .chart-wrap { grid-area: chart; height: 420px; }
  .book-card { grid-area: book; }
  .of { grid-area: of; position: sticky; top: 64px; }
}
</style>
