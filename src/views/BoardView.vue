<template>
  <div class="board">
    <!-- Live ticker tape: an always-moving pulse of the whole market. -->
    <TickerTape
      :symbols="market.symbols"
      :prices="market.prices"
      :stats="market.stats"
      :current="market.symbol"
      @select="openTrade"
    />

    <!-- Hero: the featured symbol, big and calm, with its sparkline. -->
    <section class="hero">
      <div class="hero__top">
        <button type="button" class="hero__symbol" @click="openTrade(heroSymbol)">
          <span class="hero__name">{{ heroMeta?.name ?? '…' }}</span>
          <span class="hero__sub">{{ heroMeta?.short }} · {{ heroMeta?.unit }}</span>
        </button>
        <span class="hero__badge" :class="market.isUp ? 'is-up' : 'is-down'">
          <i class="material-icons">{{ market.isUp ? 'trending_up' : 'trending_down' }}</i>
          {{ faPercent(market.changePercent) }}
        </span>
      </div>
      <div class="hero__price" :class="market.isUp ? 'is-up' : 'is-down'">
        {{ faNumber(market.price) }}<span class="hero__unit">تومان</span>
      </div>
      <div class="hero__stats">
        <span class="hero__stat">
          <i>کف</i>
          <b>{{ faCompact(market.rangeLow) }}</b>
        </span>
        <span class="hero__stat">
          <i>سقف</i>
          <b>{{ faCompact(market.rangeHigh) }}</b>
        </span>
        <span class="hero__stat" :class="market.change >= 0 ? 'is-up' : 'is-down'">
          <i>تغییر</i>
          <b>{{ faDelta(market.change) }}</b>
        </span>
      </div>
      <Sparkline class="hero__spark" :values="heroSpark" :height="46" />
    </section>

    <!-- Last update strip -->
    <div class="board__update">
      <span class="board__update-label">آخرین آپدیت قیمت</span>
      <span class="board__update-time">{{ faJalaliDateTime(market.updatedAt) }}</span>
      <span v-if="market.stale" class="board__stale">کش قدیمی</span>
    </div>

    <!-- Column headers -->
    <!-- RTL: first grid item lands rightmost, so buy (right) must precede sell. -->
    <div class="board__head">
      <span class="board__head-buy">می‌خرید</span>
      <span class="board__head-name"></span>
      <span class="board__head-sell">فروشید</span>
    </div>

    <!-- Price rows -->
    <div class="board__rows">
      <button
        v-for="s in market.symbols"
        :key="s.symbol"
        type="button"
        class="row"
        :class="{ 'is-selected': market.symbol === s.symbol }"
        @click="openTrade(s.symbol)"
      >
        <!-- Buy side (right in RTL layout) -->
        <span class="row__card row__card--buy" :class="dirClass(s.symbol)">
          <i v-if="market.direction[s.symbol]" class="row__trend material-icons">{{ market.direction[s.symbol] > 0 ? 'arrow_drop_up' : 'arrow_drop_down' }}</i>
          <span class="row__price">{{ faMoney(buyPrice(s.symbol)) }}</span>
          <span class="row__sub">{{ faMoney(market.prices[s.symbol]) }}</span>
        </span>

        <span class="row__name">
          <span class="row__label">{{ s.name }}</span>
        </span>

        <!-- Sell side (left in RTL layout) -->
        <span class="row__card row__card--sell" :class="dirClass(s.symbol)">
          <i v-if="market.direction[s.symbol]" class="row__trend material-icons">{{ market.direction[s.symbol] > 0 ? 'arrow_drop_up' : 'arrow_drop_down' }}</i>
          <span class="row__price">{{ faMoney(sellPrice(s.symbol)) }}</span>
          <span class="row__sub">{{ faMoney(market.prices[s.symbol]) }}</span>
        </span>
      </button>
    </div>

    <p class="board__note">
      قیمت خرید/فروش نرخ لحظه‌ای است · کارمزد ۰٫۵٪ هنگام تسویه سفارش اضافه می‌شود · عدد کوچک: قیمت پایه بازار
    </p>

    <!-- Account balance -->
    <section class="panel balance">
      <header class="panel__head">
        <span><i class="material-icons">account_circle</i> مانده حساب</span>
        <button type="button" class="balance__refresh" :disabled="refreshing" @click="refreshAccount">
          <i class="material-icons">refresh</i>
        </button>
      </header>

      <template v-if="auth.isLoggedIn">
        <small class="balance__time">به‌روزرسانی: {{ faTime(balanceAt) }}</small>
        <div class="balance__grid">
          <div class="balance__cell">
            <small>موجودی تومان</small>
            <b>{{ faMoney(auth.balance) }}</b>
          </div>
          <div class="balance__cell">
            <small>ارزش کل دارایی</small>
            <b class="is-accent">{{ faMoney(auth.equity) }}</b>
          </div>
          <div class="balance__cell">
            <small>سود/زیان باز</small>
            <b :class="auth.totalPnl >= 0 ? 'is-up' : 'is-down'">{{ faDelta(auth.totalPnl) }}</b>
          </div>
        </div>
        <div class="balance__bar">
          <span class="balance__bar-label">موجودی کل به طلا:</span>
          <b>{{ faWeight(goldEquivalent) }} گرم</b>
        </div>
      </template>

      <div v-else class="balance__guest">
        <p>برای مشاهده مانده حساب وارد شوید.</p>
        <button type="button" class="balance__login" @click="$router.push('/login')">ورود</button>
      </div>
    </section>

    <!-- Manager message -->
    <section class="panel message">
      <header class="panel__head"><span><i class="material-icons">forum</i> پیام مدیر</span></header>
      <p class="message__sub">هوالرزاق — شرایط و ضوابط انجام معاملات</p>
      <p class="message__preview">
        کلیه معاملات این مجموعه به‌صورت نقدی انجام می‌شود و خریداران محترم می‌توانند نسبت به
        تسویه هم‌زمان اقدام نمایند. لطفاً پیش از معامله شرایط کامل را مطالعه کنید.
      </p>
      <button type="button" class="message__more" @click="showTerms = true">
        مشاهده شرایط کامل
      </button>

    </section>

    <TermsModal v-if="showTerms" @close="showTerms = false" />
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMarketStore } from '../stores/market'
import { useAuthStore } from '../stores/auth'
import TermsModal from '../components/TermsModal.vue'
import TickerTape from '../components/TickerTape.vue'
import Sparkline from '../components/Sparkline.vue'
import { faMoney, faNumber, faWeight, faDelta, faPercent, faTime, faJalaliDateTime, faCompact } from '../utils/format'

const market = useMarketStore()
const auth = useAuthStore()
const router = useRouter()

const showTerms = ref(false)
const refreshing = ref(false)
const balanceAt = ref(Date.now())
const marketFee = auth.feePercent || 0.5

// The hero highlights 18k gold unless another symbol is already selected.
const heroSymbol = computed(() => market.symbol || 'GOLD18')
const heroMeta = computed(() => market.meta)
const heroSpark = computed(() => market.stats[heroSymbol.value]?.spark ?? [])

/**
 * Buy = what the customer pays (base + fee), Sell = what they receive
 * (base − fee) — matches how /trade/orders actually settles.
 */
function buyPrice(symbol) {
  const q = market.buys[symbol]
  if (q) return q
  const p = market.prices[symbol]
  return p ? Math.round(p * (1 + marketFee / 100)) : 0
}

function sellPrice(symbol) {
  const q = market.sells[symbol]
  if (q) return q
  const p = market.prices[symbol]
  return p ? Math.round(p * (1 - marketFee / 100)) : 0
}

function dirClass(symbol) {
  const dir = market.direction[symbol] ?? 0
  return dir > 0 ? 'is-up' : dir < 0 ? 'is-down' : ''
}

/** Per-row sparkline series from the 24h stats (empty until history exists). */
function sparkOf(symbol) {
  return market.stats[symbol]?.spark ?? []
}

function openTrade(symbol) {
  market.setSymbol(symbol)
  router.push('/trade')
}

/** Equity expressed in grams of 18k — the «موجودی کل به طلا» bar. */
const goldEquivalent = computed(() => {
  const gold18 = market.prices.GOLD18
  if (!gold18) return 0
  return auth.equity / gold18
})

async function refreshAccount() {
  refreshing.value = true
  try {
    await auth.fetchAccount()
    balanceAt.value = Date.now()
  } finally {
    refreshing.value = false
  }
}

onMounted(() => {
  void market.fetchMarket({ withChart: false, record: true })
  void market.fetchStats()
  market.startPolling(15000)
  if (auth.isLoggedIn) void auth.fetchAccount()
})

onBeforeUnmount(() => {
  market.stopPolling()
})
</script>

<style scoped>
.board {
  max-width: 720px;
  margin: 0 auto;
  padding: 12px 12px 30px;
  font-variant-numeric: tabular-nums;
}

/* ── Hero: featured symbol ── */
.hero {
  margin-top: 10px;
  padding: 16px 16px 12px;
  border-radius: 18px;
  background: linear-gradient(180deg, var(--card) 0%, var(--surface) 100%);
  border: 1px solid var(--border);
  box-shadow: 0 8px 24px rgba(20, 23, 28, 0.07);
}

.hero__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.hero__symbol {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  text-align: right;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}

.hero__name {
  font-size: 16px;
  font-weight: 800;
  color: var(--text);
  line-height: 1.3;
}

.hero__sub {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
}

.hero__badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
}

.hero__badge .material-icons {
  font-size: 16px;
}

.hero__badge.is-up {
  background: var(--up-soft);
  color: var(--up);
}

.hero__badge.is-down {
  background: var(--down-soft);
  color: var(--down);
}

.hero__price {
  margin-top: 12px;
  font-size: 30px;
  font-weight: 900;
  line-height: 1.2;
  letter-spacing: -0.5px;
  text-align: right;
}

.hero__price.is-up { color: var(--up); }
.hero__price.is-down { color: var(--down); }

.hero__unit {
  margin-right: 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-muted);
}

.hero__stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 14px;
}

.hero__stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 4px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
}

.hero__stat i {
  font-style: normal;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--text-muted);
}

.hero__stat b {
  font-size: 12.5px;
  font-weight: 800;
  color: var(--text);
}

.hero__stat.is-up b { color: var(--up); }
.hero__stat.is-down b { color: var(--down); }

.hero__spark {
  display: block;
  width: 100%;
  margin-top: 10px;
}

/* ── Last update strip ── */
.board__update {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 6px 4px 12px;
  font-size: 12.5px;
}

.board__update-label {
  color: var(--text-muted);
}

.board__update-time {
  font-weight: 800;
}

.board__stale {
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--down-soft);
  color: var(--down);
  font-size: 10.5px;
  font-weight: 800;
}

/* ── Column headers ── */
.board__head {
  display: grid;
  grid-template-columns: 1fr minmax(90px, auto) 1fr;
  gap: 8px;
  padding: 0 4px 8px;
  font-size: 13px;
  font-weight: 800;
}

.board__head-sell {
  text-align: left;
  color: var(--down);
}

.board__head-buy {
  text-align: left;
  color: var(--up);
}

/* ── Rows ── */
.board__rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(96px, auto) minmax(0, 1fr);
  gap: 6px;
  align-items: stretch;
  padding: 0;
  background: none;
  border: none;
  border-radius: 0;
  overflow: visible;
}

/* Selected row: dashed accent ring on each floating tile, like the reference. */
.row.is-selected .row__card {
  border: 2px dashed var(--accent);
}

.row__name {
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 8px 4px;
  font-size: 13px;
  font-weight: 700;
  background: none;
  border: none;
}

/* ── Rows: three separate floating tiles, each with its own colored glow ── */
.row__card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 72px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 2px solid transparent;
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.10);
}

.row:active .row__card {
  filter: brightness(0.97);
}

.row__card--buy {
  background: #eaf4ec;
  color: #1d9e48;
  box-shadow: 0 6px 16px rgba(29, 158, 72, 0.28);
}

.row__card--sell {
  background: #fbe9e9;
  color: #c62828;
  box-shadow: 0 6px 16px rgba(198, 40, 40, 0.28);
}

/* Flash the card that just ticked, like the reference board. */
.row__card.is-up {
  animation: flash-up 0.8s ease-out;
}

.row__card.is-down {
  animation: flash-down 0.8s ease-out;
}

.row__price {
  font-size: 16px;
  font-weight: 900;
  line-height: 1.55;
  white-space: nowrap;
}

.row__sub {
  font-size: 11px;
  font-weight: 700;
  opacity: 0.62;
}

/* Direction arrow pinned to the bottom-outer corner of each tile, like the reference. */
.row__trend {
  position: absolute;
  bottom: 4px;
  right: 8px;
  font-size: 20px;
  line-height: 1;
  opacity: 0.85;
  pointer-events: none;
  font-style: normal;
}

.row__card--sell .row__trend {
  right: 8px;
}

@keyframes flash-up {
  0% { background: var(--up-soft); }
  100% { background: var(--card); }
}

@keyframes flash-down {
  0% { background: var(--down-soft); }
  100% { background: var(--card); }
}

.board__note {
  margin: 10px 4px 0;
  font-size: 11px;
  line-height: 1.7;
  color: var(--text-muted);
  text-align: center;
}

/* ── Panels ── */
.panel {
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--card);
  border: 1px solid var(--border);
}

.panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13.5px;
  font-weight: 800;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}

.panel__head .material-icons {
  font-size: 19px;
  color: var(--accent);
  vertical-align: -4px;
  margin-left: 4px;
}

/* ── Balance ── */
.balance__refresh {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-muted);
}

.balance__refresh:disabled {
  opacity: 0.5;
}

.balance__time {
  display: block;
  margin-top: 7px;
  font-size: 11px;
  color: var(--text-muted);
}

.balance__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 7px;
  margin-top: 9px;
}

.balance__cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 9px 7px;
  border-radius: 10px;
  background: var(--surface);
  text-align: center;
  min-width: 0;
}

.balance__cell small {
  font-size: 10px;
  color: var(--text-muted);
}

.balance__cell b {
  font-size: 12.5px;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.balance__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
  padding: 11px 14px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: 13px;
}

.balance__bar b {
  color: var(--accent);
  font-weight: 900;
}

.balance__guest {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 10px;
  font-size: 13px;
  color: var(--text-muted);
}

.balance__guest p {
  margin: 0;
}

.balance__login {
  padding: 9px 26px;
  border-radius: 9px;
  background: var(--accent);
  color: #fff;
  font-size: 13.5px;
  font-weight: 800;
}

/* ── Manager message ── */
.message__sub {
  margin: 9px 0 6px;
  font-size: 13px;
  font-weight: 800;
}

.message__preview {
  margin: 0;
  font-size: 12.5px;
  line-height: 2;
  color: var(--text-muted);
  text-align: justify;
}

.message__more {
  width: 100%;
  margin-top: 11px;
  padding: 11px 0;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: 13px;
  font-weight: 800;
  color: var(--accent);
}
</style>


