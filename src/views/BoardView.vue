<template>
  <div class="board">
    <!-- Show loading state while fetching -->
    <div v-if="market.loading" class="board__loading">
      <span>در حال دریافت اطلاعات...</span>
    </div>

    <!-- Show error state if fetch failed -->
    <div v-else-if="market.error" class="board__error">
      <span>{{ market.error }}</span>
      <button type="button" @click="retryFetch">تلاش دوباره</button>
    </div>

    <!-- Show empty state if no symbols -->
    <div v-else-if="!market.symbols || market.symbols.length === 0" class="board__empty">
      <span>داده بازار در دسترس نیست</span>
      <button type="button" @click="retryFetch">تلاش دوباره</button>
    </div>

    <!-- Normal board content -->
    <template v-else>
      <!-- Live ticker tape: an always-moving pulse of the whole market. -->
      <TickerTape
        v-if="showTicker"
        :symbols="market.symbols"
        :prices="market.prices"
        :stats="market.stats"
        :current="market.symbol"
        @select="quickOrder"
      />

      <!-- Last update strip -->
      <div class="board__update">
        <span class="board__update-label">آخرین آپدیت قیمت</span>
        <span class="board__update-time">{{ faJalaliDateTime(market.updatedAt) }}</span>
      </div>

      <!-- Column headers -->
      <!-- RTL: first grid item lands rightmost, so buy (right) must precede sell. -->
      <div class="board__head">
        <span class="board__head-buy">می‌خرید</span>
        <span class="board__head-name"></span>
        <span class="board__head-sell">میفروشید</span>
      </div>

      <!-- Price rows.
        Customer: buy/sell tiles are order actions (open the quick sheet).
        Everyone else (guest/staff): the whole block is a read-only price tile. -->
      <div class="board__rows">
        <template v-for="s in visibleRows" :key="s.symbol">
          <div v-if="auth.isLoggedIn && auth.isCustomer" class="row" :class="{ 'is-selected': market.symbol === s.symbol }">
            <!-- Buy side (right in RTL layout) -->
            <button type="button" class="row__card row__card--buy" :class="dirClass(s.symbol)" @click="quickOrder(s.symbol, 'BUY')">
              <i v-if="market.direction[s.symbol]" class="row__trend material-icons">{{ market.direction[s.symbol] > 0 ? 'arrow_drop_up' : 'arrow_drop_down' }}</i>
              <span class="row__price">{{ faMoney(buyPrice(s.symbol)) }}</span>
              <span class="row__sub">{{ faMoney(market.prices[s.symbol]) }}</span>
            </button>

            <button type="button" class="row__name" @click="quickOrder(s.symbol, 'BUY')">
              <span class="row__label">{{ s.name }}</span>
            </button>

            <!-- Sell side (left in RTL layout) -->
            <button type="button" class="row__card row__card--sell" :class="dirClass(s.symbol)" @click="quickOrder(s.symbol, 'SELL')">
              <i v-if="market.direction[s.symbol]" class="row__trend material-icons">{{ market.direction[s.symbol] > 0 ? 'arrow_drop_up' : 'arrow_drop_down' }}</i>
              <span class="row__price">{{ faMoney(sellPrice(s.symbol)) }}</span>
              <span class="row__sub">{{ faMoney(market.prices[s.symbol]) }}</span>
            </button>
          </div>

          <div
            v-else
            class="row"
            :class="{ 'is-selected': market.symbol === s.symbol }"
          >
            <!-- Buy side (right in RTL layout) -->
            <button type="button" class="row__card row__card--buy" :class="dirClass(s.symbol)" @click="quickOrder(s.symbol, 'BUY')">
              <i v-if="market.direction[s.symbol]" class="row__trend material-icons">{{ market.direction[s.symbol] > 0 ? 'arrow_drop_up' : 'arrow_drop_down' }}</i>
              <span class="row__price">{{ faMoney(buyPrice(s.symbol)) }}</span>
              <span class="row__sub">{{ faMoney(market.prices[s.symbol]) }}</span>
            </button>

            <span class="row__name">
              <span class="row__label">{{ s.name }}</span>
            </span>

            <!-- Sell side (left in RTL layout) -->
            <button type="button" class="row__card row__card--sell" :class="dirClass(s.symbol)" @click="quickOrder(s.symbol, 'SELL')">
              <i v-if="market.direction[s.symbol]" class="row__trend material-icons">{{ market.direction[s.symbol] > 0 ? 'arrow_drop_up' : 'arrow_drop_down' }}</i>
              <span class="row__price">{{ faMoney(sellPrice(s.symbol)) }}</span>
              <span class="row__sub">{{ faMoney(market.prices[s.symbol]) }}</span>
            </button>
          </div>
        </template>
      </div>
      <!-- <div class="board__more">
        <button type="button" class="board__more-btn" @click="showAll = !showAll">
          {{ showAll ? 'نمایش کمتر' : 'نمایش همه نمادها' }}
        </button>
      </div> -->
      <p v-if="auth.isLoggedIn" class="board__note">
        برای ثبت سریع، روی قیمت خرید یا فروش بزنید · عدد کوچک: قیمت پایه بازار
      </p>
      <p v-else class="board__note">
        قیمت خرید/فروش نرخ لحظه‌ای است · عدد کوچک: قیمت پایه بازار
      </p>

      <!-- Account balance — customers and guests only; staff work from their
        dedicated screens and don't need the wallet panel on the board. -->
      <section v-if="!auth.isStaff" class="panel balance">
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
          <button type="button" class="balance__login" @click="openLogin('login')">ورود</button>
        </div>
      </section>

      <!-- Manager message — customers and guests only. -->
      <section v-if="!auth.isStaff" class="panel message">
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

    </template>
  </div>

  <!-- Modals are rendered outside the market v-else block so they are never
       torn down by a price poll update. Their visibility is controlled solely
       by their own open flags. -->
  <TermsModal v-if="showTerms" @close="showTerms = false" />

  <QuickOrderSheet
    :open="quickOpen"
    :symbol="quickSymbol"
    :side="quickSide"
    @close="quickOpen = false"
    @done="onQuickDone"
  />
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { useMarketStore } from '../stores/market'
import { useAuthStore } from '../stores/auth'
import TermsModal from '../components/TermsModal.vue'
import TickerTape from '../components/TickerTape.vue'
import QuickOrderSheet from './QuickOrderSheet.vue'
import { openLogin } from '../utils/authGate'
import { loadFeatured, loadVisible } from '../utils/boardPrefs'
import { faMoney, faWeight, faDelta, faTime, faJalaliDateTime } from '../utils/format'

function loadTickerPref() {
  try {
    const stored = localStorage.getItem('dg_show_ticker')
    return stored === null ? false : stored === 'true'
  } catch {
    return false
  }
}

function refreshTickerPref() {
  showTicker.value = loadTickerPref()
}

const market = useMarketStore()
const auth = useAuthStore()
const router = useRouter()

const showTerms = ref(false)
const refreshing = ref(false)
const balanceAt = ref(Date.now())
const marketFee = auth.feePercent || 0.5
const showTicker = ref(loadTickerPref())

// Quick order from the board — customer-only. Guests get the login sheet,
// staff keep read-only tiles and never see this sheet.
const quickOpen = ref(false)
const quickSymbol = ref('')
const quickSide = ref('BUY')

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

function quickOrder(symbol, side) {
  if (!auth.isLoggedIn) {
    openLogin('login')
    return
  }
  quickSymbol.value = symbol
  quickSide.value = side ?? 'BUY'
  quickOpen.value = true
}
function onQuickDone() {
  balanceAt.value = Date.now()
}

const goldEquivalent = computed(() => {
  const gold18 = market.prices.GOLD18
  if (!gold18) return 0
  return auth.equity / gold18
})

/**
 * Customer home: just 2 buttons (buy/sell) for the featured symbol by
 * default. Customer enables more symbols from Settings → those rows appear.
 * Guests/staff always see the full read-only board.
 */
const boardPrefsTick = ref(0)
const showAll = ref(false)
const symbolList = ref([])

// Update symbol list only when market actually provides new symbols
watchEffect(() => {
  if (market.symbols && market.symbols.length > 0) {
    // Only update if symbols actually changed by comparing IDs
    if (!symbolList.value.length || 
        symbolList.value.length !== market.symbols.length ||
        symbolList.value[0]?.symbol !== market.symbols[0]?.symbol) {
      symbolList.value = market.symbols
    }
  }
})

const visibleRows = computed(() => {
  void boardPrefsTick.value
  
  const allSymbols = symbolList.value
  if (!allSymbols || allSymbols.length === 0) return []
  
  if (showAll.value) return allSymbols
  
  const visible = loadVisible()
  if (visible && visible.length) {
    const set = new Set(visible)
    const rows = allSymbols.filter(s => set.has(s.symbol))
    if (rows.length) return rows
  }
  
  const feat = loadFeatured(market.symbol || 'GOLD18')
  const found = allSymbols.find(s => s.symbol === feat)
  if (found) return [found]
  
  return allSymbols.slice(0, 1)
})

function refreshBoardPrefs() {
  boardPrefsTick.value++
}

async function refreshAccount() {
  refreshing.value = true
  try {
    await auth.fetchAccount()
    balanceAt.value = Date.now()
  } finally {
    refreshing.value = false
  }
}

async function retryFetch() {
  await market.fetchMarket({ withChart: false, record: true })
  await market.fetchStats()
}

onMounted(() => {
  void market.fetchMarket({ withChart: false, record: true })
  void market.fetchStats()
  market.startPolling(15000)
  if (auth.isLoggedIn) void auth.fetchAccount()
  window.addEventListener('storage', refreshBoardPrefs)
  window.addEventListener('dg-board-prefs', refreshBoardPrefs)
  window.addEventListener('dg-ticker-pref', refreshTickerPref)
})

onBeforeUnmount(() => {
  market.stopPolling()
  window.removeEventListener('storage', refreshBoardPrefs)
  window.removeEventListener('dg-board-prefs', refreshBoardPrefs)
  window.removeEventListener('dg-ticker-pref', refreshTickerPref)
})
</script>

<style scoped>
.board {
  max-width: 720px;
  margin: 0 auto;
  padding: 12px 12px 30px;
  font-variant-numeric: tabular-nums;
}

/* ── Loading, Error, and Empty States ── */
.board__loading,
.board__error,
.board__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 40px 20px;
  min-height: 300px;
  text-align: center;
  color: var(--text-muted);
}

.board__error,
.board__empty {
  gap: 20px;
}

.board__error button,
.board__empty button {
  padding: 9px 20px;
  border-radius: 9px;
  background: var(--accent);
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
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
  grid-template-columns: 1fr auto 1fr;
  gap: 8px;
  padding: 0 4px 8px;
  font-size: 13px;
  font-weight: 800;
}

.board__head-sell {
  text-align: center;
  color: var(--down);
}

.board__head-buy {
  text-align: center;
  color: var(--up);
}

/* ── Rows ── */
.board__more {
  display: flex;
  justify-content: center;
  margin-top: 10px;
}

.board__more-btn {
  padding: 9px 26px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--accent);
  font-size: 12.5px;
  font-weight: 800;
}

.board__rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 6px;
  align-items: stretch;
  padding: 0;
  background: none;
  border: none;
  border-radius: 0;
  overflow: visible;
  min-width: 0;
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
  min-width: 0;
  padding: 10px 6px;
  border-radius: 14px;
  border: 2px solid transparent;
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.10);
  overflow: hidden;
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
  width: 100%;
  font-size: clamp(12px, 3.6vw, 16px);
  font-weight: 900;
  line-height: 1.55;
  text-align: center;
  white-space: normal;
  overflow-wrap: anywhere;
}

.row__sub {
  width: 100%;
  font-size: 11px;
  font-weight: 700;
  opacity: 0.62;
  text-align: center;
  white-space: normal;
  overflow-wrap: anywhere;
}

/* Direction arrow pinned to the bottom-outer corner of each tile, like the reference. */
.row__trend {
  position: absolute;
  bottom: 2px;
  right: 6px;
  font-size: 17px;
  line-height: 1;
  opacity: 0.85;
  pointer-events: none;
  font-style: normal;
}

.row__card--sell .row__trend {
  right: 6px;
}

/* Narrow phones: tighter paddings so long prices (e.g. سکه امامی) never
   push text outside the tile or the screen. */
@media (max-width: 420px) {
  .board {
    padding: 10px 8px 26px;
  }

  .row {
    gap: 5px;
  }

  .row__card {
    min-height: 68px;
    padding: 8px 4px;
    border-radius: 12px;
  }

  .row__name {
    padding: 8px 2px;
    font-size: 12px;
  }

  .row__sub {
    font-size: 10px;
  }
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


