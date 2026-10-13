<template>
  <div class="page">
    <header class="head">
      <div>
        <h1 class="title">کیف پول</h1>
        <p class="sub">موجودی نقد، طلاهای شما و گردش حساب</p>
      </div>
      <button
        type="button"
        class="icon-btn material-icons"
        :class="{ 'is-busy': refreshing }"
        :disabled="refreshing"
        title="بازآوری"
        @click="refresh"
      >
        refresh
      </button>
    </header>

    <div v-if="!auth.isLoggedIn" class="empty">
      <span class="material-icons empty__icon">account_balance_wallet</span>
      <p class="empty__text">برای دیدن کیف پول، ابتدا وارد شوید</p>
      <button type="button" class="btn btn--primary" @click="$router.push('/login')">
        <span class="material-icons">login</span> ورود به حساب
      </button>
    </div>

    <template v-else>
      <!-- Balance card ─────────────────────────────────────────────────────── -->
      <section class="balance">
        <div class="balance__top">
          <span class="balance__label">
            <span class="material-icons">account_balance_wallet</span>
            موجودی نقد
          </span>
          <span class="balance__pill">کارمزد {{ faPercent(auth.feePercent, 2) }}</span>
        </div>

        <div class="balance__value tnum">{{ faMoney(auth.balance) }}</div>

        <div class="balance__cells">
          <div class="balance__cell">
            <small>ارزش کل دارایی</small>
            <b class="tnum">{{ faMoney(auth.equity) }}</b>
          </div>
          <div class="balance__cell">
            <small>ارزش طلا</small>
            <b class="tnum">{{ faMoney(goldValue) }}</b>
          </div>
          <div class="balance__cell">
            <small>سود/زیان باز</small>
            <b class="tnum" :class="auth.totalPnl >= 0 ? 'is-up' : 'is-down'">
              {{ faDelta(auth.totalPnl) }}
            </b>
          </div>
        </div>

        <div class="balance__actions">
          <button type="button" class="act act--in" @click="openPanel('deposit')">
            <span class="material-icons">add</span> واریز
          </button>
          <button
            type="button"
            class="act act--out"
            :disabled="auth.balance <= 0"
            @click="openPanel('withdraw')"
          >
            <span class="material-icons">remove</span> برداشت
          </button>
          <button
            type="button"
            class="act act--swap"
            :disabled="!holdings.length"
            @click="openPanel('convert')"
          >
            <span class="material-icons">swap_horiz</span> تبدیل طلا
          </button>
        </div>
      </section>

      <p v-if="auth.error" class="alert" role="alert">
        <span class="material-icons">error_outline</span> {{ auth.error }}
      </p>
      <p v-if="convertNotice" class="alert" role="status">
        <span class="material-icons">info</span> {{ convertNotice }}
      </p>

      <!-- Gold holdings ────────────────────────────────────────────────────── -->
      <section class="block">
        <h2 class="block__title">
          <span class="material-icons">inventory_2</span> طلاهای من
        </h2>

        <div v-if="!holdings.length" class="empty empty--inline">
          <span class="material-icons empty__icon">hourglass_empty</span>
          <p class="empty__text">هنوز طلایی ندارید — از صفحه معاملات خرید کنید</p>
          <button type="button" class="btn" @click="$router.push('/trade')">
            رفتن به معاملات
          </button>
        </div>

        <ul v-else class="holdings">
          <li v-for="h in holdings" :key="h.symbol" class="holding">
            <div class="holding__icon material-icons">{{ iconOf(h.symbol) }}</div>
            <div class="holding__main">
              <b class="holding__name">{{ nameOf(h.symbol) }}</b>
              <small class="muted">
                میانگین خرید {{ faMoney(h.avgCost) }} / {{ unitOf(h.symbol) }}
              </small>
            </div>
            <div class="holding__side">
              <b class="tnum">{{ faWeight(h.grams) }}</b>
              <small class="tnum" :class="h.pnl >= 0 ? 'is-up' : 'is-down'">
                {{ faDelta(h.pnl) }}
              </small>
            </div>
            <button
              type="button"
              class="holding__swap material-icons"
              title="تبدیل به نماد دیگر"
              @click="startConvert(h.symbol)"
            >
              swap_horiz
            </button>
          </li>
        </ul>
      </section>

      <!-- Pending charge requests (resume: send receipt / connect bank) ─────── -->
      <section v-if="pending.length" class="block">
        <h2 class="block__title">
          <span class="material-icons">pending_actions</span> درخواست‌های در انتظار
        </h2>
        <ul class="pend">
          <li v-for="d in pending" :key="d.id" class="pend__item">
            <div class="pend__main">
              <b class="tnum">{{ faMoney(d.amount) }}</b>
              <small class="muted">{{ methodName(d.method) }} · {{ faAgo(d.createdAt) }}</small>
            </div>
            <div class="pend__side">
              <button type="button" class="pend__pay" @click="openPay(d)">ادامه پرداخت</button>
              <button
                type="button"
                class="pend__x material-icons"
                title="لغو درخواست"
                aria-label="لغو درخواست"
                @click="dropPending(d.id)"
              >
                close
              </button>
            </div>
          </li>
        </ul>
      </section>

      <!-- Statement ────────────────────────────────────────────────────────── -->
      <section class="block">
        <h2 class="block__title">
          <span class="material-icons">receipt_long</span> گردش حساب
          <small v-if="auth.transactions.length" class="muted">
            {{ toFa(auth.transactions.length) }} تراکنش
          </small>
        </h2>

        <div v-if="!auth.transactions.length" class="empty empty--inline">
          <p class="empty__text">تراکنشی ثبت نشده است</p>
        </div>

        <ul v-else class="ledger">
          <li v-for="tx in auth.transactions" :key="tx.id" class="tx">
            <span class="tx__icon material-icons" :class="`is-${txKindTone(tx.kind)}`">
              {{ txKindIcon(tx.kind) }}
            </span>
            <div class="tx__main">
              <b class="tx__kind">{{ faTxKind(tx.kind) }}</b>
              <small class="muted tx__note">{{ tx.note || '—' }}</small>
            </div>
            <div class="tx__side">
              <b class="tnum" :class="`is-${txKindTone(tx.kind)}`">
                {{ faTxAmount(tx) }}
              </b>
              <small class="muted tnum">{{ faJalaliDateTime(tx.createdAt) }}</small>
            </div>
          </li>
        </ul>
      </section>
    </template>

    <!-- ── Sheets ───────────────────────────────────────────────────────────── -->
    <DepositSheet
      v-if="panel === 'deposit'"
      :busy="auth.loading"
      @close="panel = ''"
      @submit="doDeposit"
    />
    <WithdrawSheet
      v-if="panel === 'withdraw'"
      :balance="auth.balance"
      :busy="auth.loading"
      @close="panel = ''"
      @submit="doWithdraw"
    />
    <ConvertSheet
      v-if="panel === 'convert'"
      :holdings="holdings"
      :symbols="symbolOptions"
      :prices="priceMap"
      :busy="auth.loading"
      :preset-from="convertFrom"
      @close="panel = ''"
      @submit="doConvert"
    />
    <DepositPaySheet
      v-if="payDeposit"
      :deposit="payDeposit"
      :busy="auth.loading"
      @close="closePay"
      @done="onPaid"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useMarketStore } from '../stores/market'
import {
  faMoney,
  faDelta,
  faPercent,
  faWeight,
  faAgo,
  faTxAmount,
  faTxKind,
  faJalaliDateTime,
  txKindIcon,
  txKindTone,
  toFa
} from '../utils/format'
import DepositSheet from '../components/wallet/DepositSheet.vue'
import DepositPaySheet from '../components/wallet/DepositPaySheet.vue'
import WithdrawSheet from '../components/wallet/WithdrawSheet.vue'
import ConvertSheet from '../components/wallet/ConvertSheet.vue'

const auth = useAuthStore()
const market = useMarketStore()

const panel = ref('')
const convertFrom = ref('')
const refreshing = ref(false)
const payDeposit = ref(null)

/** Pending charge requests the user can resume (send receipt / connect bank). */
const pending = computed(() => auth.pendingDeposits)

/** Positions the user actually holds, largest first so the list is stable. */
const holdings = computed(() =>
  auth.positions
    .filter(p => p.grams > 0)
    .map(p => ({ ...p, pnl: p.pnl ?? 0 }))
    .sort((a, b) => b.grams - a.grams)
)

/** Market value of the gold = total equity minus the cash balance. */
const goldValue = computed(() => Math.max(0, auth.equity - auth.balance))

/** Live price per symbol, for the convert sheet's quote preview. */
const priceMap = computed(() => market.prices)

/** Every tradeable symbol, so the user can convert into one they do not hold. */
const symbolOptions = computed(() =>
  market.symbols.map(s => ({
    symbol: s.symbol,
    name: s.name,
    short: s.short,
    unit: s.unit
  }))
)

const metaOf = symbol => market.symbols.find(s => s.symbol === symbol)
const nameOf = symbol => metaOf(symbol)?.name ?? symbol ?? '—'
const unitOf = symbol => metaOf(symbol)?.unit ?? 'گرم'

/** Persian label for a deposit method (shared with the deposit/pay sheets). */
const DEPOSIT_METHODS = {
  BANK_TRANSFER: 'کارت به کارت',
  CARD: 'درگاه بانکی',
  CRYPTO: 'رمزارز'
}
const methodName = method => DEPOSIT_METHODS[method] ?? 'واریز'

/**
 * Coins are counted per piece, gold is weighed — so pick the glyph by the
 * symbol's `kind` rather than inventing an icon per symbol. (`kind` comes from
 * the server's TRADE_SYMBOLS; there is no `icon` field to read.)
 */
const iconOf = symbol => (metaOf(symbol)?.kind === 'coin' ? 'toll' : 'scale')

function openPanel(next) {
  panel.value = next
}

function startConvert(symbol) {
  convertFrom.value = symbol
  openPanel('convert')
}

/**
 * Reload both halves of the screen: the wallet (cash, gold, ledger) and the
 * board (needed to value the gold). Awaited together so the button only un-busies
 * once the numbers on screen are actually current.
 */
async function refresh() {
  refreshing.value = true
  try {
    await Promise.all([auth.fetchWallet(100), market.fetchMarket({ withChart: false })])
  } finally {
    refreshing.value = false
  }
}

async function doDeposit({ amount, method, reference, note }) {
  // Step 1: record the charge as a PENDING request (no money moves yet),
  // then open the pay sheet to send the receipt / connect to the bank.
  const { ok, deposit } = await auth.createDeposit({ amount, method, reference, note })
  panel.value = ''
  if (ok) payDeposit.value = deposit
}

function openPay(deposit) {
  payDeposit.value = deposit
}

function closePay() {
  payDeposit.value = null
}

function onPaid() {
  payDeposit.value = null
  void refresh()
}

function dropPending(id) {
  auth.cancelDeposit(id)
}

async function doWithdraw({ amount, note }) {
  // Store signature: requestWithdrawal(amount, destination, note). The sheet
  // only collects an optional note, so destination falls back to the note.
  const { ok } = await auth.requestWithdrawal(amount, note || 'برداشت وجه', note || '')
  if (ok) panel.value = ''
}

const convertNotice = ref('')
async function doConvert() {
  // Backend has no convert endpoint — surface a Persian no-op notice instead.
  convertNotice.value = 'امکان تبدیل طلا در حال حاضر فعال نیست'
  panel.value = ''
}

onMounted(async () => {
  if (!auth.isLoggedIn) return
  // One read up front, then let the board's poll keep valuations fresh. The
  // wallet is re-fetched by every action, which is enough between polls.
  await refresh()
  market.startPolling(15000)
})

onUnmounted(() => {
  // The market store is shared with the trading screens; its own guard keeps the
  // poll alive while another view still needs it, so calling this is safe.
  market.stopPolling()
})
</script>

