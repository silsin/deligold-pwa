<template>
  <div class="page">
    <header class="head">
      <div>
        <h1 class="title">Ú©ÛŒÙ Ù¾ÙˆÙ„</h1>
        <p class="sub">Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ù†Ù‚Ø¯ØŒ Ø·Ù„Ø§Ù‡Ø§ÛŒ Ø´Ù…Ø§ Ùˆ Ú¯Ø±Ø¯Ø´ Ø­Ø³Ø§Ø¨</p>
      </div>
      <button
        type="button"
        class="icon-btn material-icons"
        :class="{ 'is-busy': refreshing }"
        :disabled="refreshing"
        title="Ø¨Ø§Ø²Ø¢ÙˆØ±ÛŒ"
        @click="refresh"
      >
        refresh
      </button>
    </header>

    <div v-if="!auth.isLoggedIn" class="empty">
      <span class="material-icons empty__icon">account_balance_wallet</span>
      <p class="empty__text">Ø¨Ø±Ø§ÛŒ Ø¯ÛŒØ¯Ù† Ú©ÛŒÙ Ù¾ÙˆÙ„ØŒ Ø§Ø¨ØªØ¯Ø§ ÙˆØ§Ø±Ø¯ Ø´ÙˆÛŒØ¯</p>
      <button type="button" class="btn btn--primary" @click="openLogin('login')">
        <span class="material-icons">login</span> ÙˆØ±ÙˆØ¯ Ø¨Ù‡ Ø­Ø³Ø§Ø¨
      </button>
    </div>

    <template v-else>
      <!-- Balance card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ -->
      <section class="balance">
        <div class="balance__top">
          <span class="balance__label">
            <span class="material-icons">account_balance_wallet</span>
            Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ù†Ù‚Ø¯
          </span>
          <span class="balance__pill">Ú©Ø§Ø±Ù…Ø²Ø¯ {{ faPercent(auth.feePercent, 2) }}</span>
        </div>

        <div class="balance__value tnum">{{ faMoney(auth.balance) }}</div>

        <div class="balance__cells">
          <div class="balance__cell">
            <small>Ø§Ø±Ø²Ø´ Ú©Ù„ Ø¯Ø§Ø±Ø§ÛŒÛŒ</small>
            <b class="tnum">{{ faMoney(auth.equity) }}</b>
          </div>
          <div class="balance__cell">
            <small>Ø§Ø±Ø²Ø´ Ø·Ù„Ø§</small>
            <b class="tnum">{{ faMoney(goldValue) }}</b>
          </div>
          <div class="balance__cell">
            <small>Ø³ÙˆØ¯/Ø²ÛŒØ§Ù† Ø¨Ø§Ø²</small>
            <b class="tnum" :class="auth.totalPnl >= 0 ? 'is-up' : 'is-down'">
              {{ faDelta(auth.totalPnl) }}
            </b>
          </div>
        </div>

        <div class="balance__actions">
          <button type="button" class="act act--in" @click="openPanel('deposit')">
            <span class="material-icons">add</span> ÙˆØ§Ø±ÛŒØ²
          </button>
          <button
            type="button"
            class="act act--out"
            :disabled="auth.balance <= 0"
            @click="openPanel('withdraw')"
          >
            <span class="material-icons">remove</span> Ø¨Ø±Ø¯Ø§Ø´Øª
          </button>
          <button
            type="button"
            class="act act--swap"
            :disabled="!holdings.length"
            @click="openPanel('convert')"
          >
            <span class="material-icons">swap_horiz</span> ØªØ¨Ø¯ÛŒÙ„ Ø·Ù„Ø§
          </button>
        </div>
      </section>

      <p v-if="auth.error" class="alert" role="alert">
        <span class="material-icons">error_outline</span> {{ auth.error }}
      </p>
      <p v-if="convertNotice" class="alert" role="status">
        <span class="material-icons">info</span> {{ convertNotice }}
      </p>

      <!-- Gold holdings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ -->
      <section class="block">
        <h2 class="block__title">
          <span class="material-icons">inventory_2</span> Ø·Ù„Ø§Ù‡Ø§ÛŒ Ù…Ù†
        </h2>

        <div v-if="!holdings.length" class="empty empty--inline">
          <span class="material-icons empty__icon">hourglass_empty</span>
          <p class="empty__text">Ù‡Ù†ÙˆØ² Ø·Ù„Ø§ÛŒÛŒ Ù†Ø¯Ø§Ø±ÛŒØ¯ â€” Ø§Ø² ØµÙØ­Ù‡ Ù…Ø¹Ø§Ù…Ù„Ø§Øª Ø®Ø±ÛŒØ¯ Ú©Ù†ÛŒØ¯</p>
          <button type="button" class="btn" @click="$router.push('/trade')">
            Ø±ÙØªÙ† Ø¨Ù‡ Ù…Ø¹Ø§Ù…Ù„Ø§Øª
          </button>
        </div>

        <ul v-else class="holdings">
          <li v-for="h in holdings" :key="h.symbol" class="holding">
            <div class="holding__icon material-icons">{{ iconOf(h.symbol) }}</div>
            <div class="holding__main">
              <b class="holding__name">{{ nameOf(h.symbol) }}</b>
              <small class="muted">
                Ù…ÛŒØ§Ù†Ú¯ÛŒÙ† Ø®Ø±ÛŒØ¯ {{ faMoney(h.avgCost) }} / {{ unitOf(h.symbol) }}
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
              title="ØªØ¨Ø¯ÛŒÙ„ Ø¨Ù‡ Ù†Ù…Ø§Ø¯ Ø¯ÛŒÚ¯Ø±"
              @click="startConvert(h.symbol)"
            >
              swap_horiz
            </button>
          </li>
        </ul>
      </section>

      <!-- Statement â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ -->
      <section class="block">
        <h2 class="block__title">
          <span class="material-icons">receipt_long</span> Ú¯Ø±Ø¯Ø´ Ø­Ø³Ø§Ø¨
          <small v-if="auth.transactions.length" class="muted">
            {{ toFa(auth.transactions.length) }} ØªØ±Ø§Ú©Ù†Ø´
          </small>
        </h2>

        <div v-if="!auth.transactions.length" class="empty empty--inline">
          <p class="empty__text">ØªØ±Ø§Ú©Ù†Ø´ÛŒ Ø«Ø¨Øª Ù†Ø´Ø¯Ù‡ Ø§Ø³Øª</p>
        </div>

        <ul v-else class="ledger">
          <li v-for="tx in auth.transactions" :key="tx.id" class="tx">
            <span class="tx__icon material-icons" :class="`is-${txKindTone(tx.kind)}`">
              {{ txKindIcon(tx.kind) }}
            </span>
            <div class="tx__main">
              <b class="tx__kind">{{ faTxKind(tx.kind) }}</b>
              <small class="muted tx__note">{{ tx.note || 'â€”' }}</small>
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

    <!-- â”€â”€ Sheets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ -->
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
  faTxAmount,
  faTxKind,
  faJalaliDateTime,
  txKindIcon,
  txKindTone,
  toFa
} from '../utils/format'
import DepositSheet from '../components/wallet/DepositSheet.vue'
import WithdrawSheet from '../components/wallet/WithdrawSheet.vue'
import ConvertSheet from '../components/wallet/ConvertSheet.vue'

const auth = useAuthStore()
const market = useMarketStore()

const panel = ref('')
const convertFrom = ref('')
const refreshing = ref(false)

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
const nameOf = symbol => metaOf(symbol)?.name ?? symbol ?? 'â€”'
const unitOf = symbol => metaOf(symbol)?.unit ?? 'Ú¯Ø±Ù…'

/**
 * Coins are counted per piece, gold is weighed â€” so pick the glyph by the
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

async function doDeposit(amount) {
  // Store signature: requestDeposit(amount, method, reference, note).
  const { ok } = await auth.requestDeposit(amount, 'BANK_TRANSFER', '', '')
  if (ok) panel.value = ''
}

async function doWithdraw({ amount, note }) {
  // Store signature: requestWithdrawal(amount, destination, note). The sheet
  // only collects an optional note, so destination falls back to the note.
  const { ok } = await auth.requestWithdrawal(amount, note || 'Ø¨Ø±Ø¯Ø§Ø´Øª ÙˆØ¬Ù‡', note || '')
  if (ok) panel.value = ''
}

const convertNotice = ref('')
async function doConvert() {
  // Backend has no convert endpoint â€” surface a Persian no-op notice instead.
  convertNotice.value = 'Ø§Ù…Ú©Ø§Ù† ØªØ¨Ø¯ÛŒÙ„ Ø·Ù„Ø§ Ø¯Ø± Ø­Ø§Ù„ Ø­Ø§Ø¶Ø± ÙØ¹Ø§Ù„ Ù†ÛŒØ³Øª'
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


<style scoped>
/* â”€â”€ Layout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
.page {
  max-width: 560px;
  margin: 0 auto;
  padding: 16px 14px 30px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.title {
  margin: 0;
  font-size: 20px;
  font-weight: 900;
  color: var(--accent);
}

.sub {
  margin: 2px 0 0;
  font-size: 11.5px;
  color: var(--text-muted);
}

.icon-btn {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 19px;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.icon-btn:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.icon-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.icon-btn.is-busy {
  color: var(--accent);
  animation: wallet-spin 0.9s linear infinite;
}

/* â”€â”€ Balance hero â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
.balance {
  padding: 18px 16px 16px;
  border-radius: var(--radius);
  background:
    radial-gradient(120% 130% at 100% 0%, rgba(212, 175, 55, 0.16), transparent 62%),
    var(--card);
  border: 1px solid var(--border);
}

.balance__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.balance__label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--text-muted);
}

.balance__label .material-icons {
  font-size: 15px;
  color: var(--accent);
}

.balance__pill {
  padding: 3px 9px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  border: 1px solid var(--border);
  color: var(--accent);
  font-size: 10.5px;
  font-weight: 800;
}

.balance__value {
  margin: 8px 0 0;
  font-size: 30px;
  font-weight: 900;
  line-height: 1.25;
  letter-spacing: -0.4px;
}

.balance__cells {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}

.balance__cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.balance__cell small {
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.balance__cell b {
  font-size: 13px;
  font-weight: 800;
}

/* â”€â”€ Deposit / withdraw / convert â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
.balance__actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 16px;
}

.act {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 11px 6px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface);
  font-size: 11.5px;
  font-weight: 800;
  color: var(--text);
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.1s ease;
}

.act .material-icons {
  font-size: 18px;
}

.act:active:not(:disabled) {
  transform: scale(0.97);
}

.act:disabled {
  opacity: 0.42;
  cursor: default;
}

.act--in:hover:not(:disabled) {
  border-color: var(--up);
  background: var(--up-soft);
  color: var(--up);
}

.act--out:hover:not(:disabled) {
  border-color: var(--down);
  background: var(--down-soft);
  color: var(--down);
}

.act--swap:hover:not(:disabled) {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
}

/* â”€â”€ Section blocks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
.block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.block__title {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  font-size: 14.5px;
  font-weight: 900;
}

.block__title .material-icons {
  font-size: 17px;
  color: var(--accent);
}

.block__title small {
  margin-inline-start: auto;
  font-size: 10.5px;
  font-weight: 600;
}

.muted {
  color: var(--text-muted);
}

/* â”€â”€ Holdings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
.holdings,
.ledger {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.holding {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 12px 13px;
  border-radius: var(--radius-sm);
  background: var(--card);
  border: 1px solid var(--border);
  transition: border-color 0.15s ease;
}

.holding:hover {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
}

.holding__icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  font-size: 19px;
}

.holding__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.holding__name {
  font-size: 13.5px;
  font-weight: 800;
}

.holding__main small {
  font-size: 10.5px;
}

.holding__side {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.holding__side b {
  font-size: 14px;
  font-weight: 900;
}

.holding__side small {
  font-size: 10.5px;
  font-weight: 700;
}

/* â”€â”€ Statement â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
.tx {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 12px 13px;
  border-radius: var(--radius-sm);
  background: var(--card);
  border: 1px solid var(--border);
}

.tx__icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  font-size: 17px;
}

.tx__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.tx__kind {
  font-size: 13px;
  font-weight: 800;
}

.tx__note {
  font-size: 10.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tx__side {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.tx__side b {
  font-size: 13.5px;
  font-weight: 900;
}

.tx__side small {
  font-size: 10px;
}

/* â”€â”€ Empty states â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 20px;
  border-radius: var(--radius);
  border: 1px dashed var(--border);
  text-align: center;
}

.empty--inline {
  gap: 10px;
  padding: 26px 16px;
  background: var(--card);
}

.empty__icon {
  font-size: 38px;
  color: color-mix(in srgb, var(--accent) 65%, var(--text-muted));
}

.empty--inline .empty__icon {
  font-size: 28px;
}

.empty__text {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-muted);
}

/* â”€â”€ Buttons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
.btn {
  padding: 10px 20px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: 13px;
  font-weight: 800;
  color: var(--text);
  transition: border-color 0.15s ease, background 0.15s ease;
}

.btn--primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--accent);
  border-color: var(--accent);
  color: #14100a;
}

.btn--primary:hover {
  background: var(--accent-light);
  border-color: var(--accent-light);
}

/* â”€â”€ Sign / tone colours â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
.is-up {
  color: var(--up);
}

.is-down {
  color: var(--down);
}

.is-swap {
  color: var(--accent);
}

.is-fee,
.is-muted {
  color: var(--text-muted);
}

.tx__icon.is-in {
  background: var(--up-soft);
  color: var(--up);
}

.tx__icon.is-out {
  background: var(--down-soft);
  color: var(--down);
}

.tx__icon.is-swap {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
}

.tx__icon.is-fee,
.tx__icon.is-muted {
  background: var(--surface);
  color: var(--text-muted);
}

@media (max-width: 360px) {
  .balance__value {
    font-size: 25px;
  }

  .balance__actions {
    gap: 6px;
  }
}
.holding__swap {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 16px;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.holding__swap:hover {
  color: var(--accent);
  border-color: var(--accent);
}

/* â”€â”€ Notices â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
.alert {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 11px 13px;
  border-radius: var(--radius-sm);
  background: var(--down-soft);
  border: 1px solid color-mix(in srgb, var(--down) 35%, transparent);
  color: var(--down);
  font-size: 12.5px;
  font-weight: 700;
}

.alert[role='status'] {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border-color: color-mix(in srgb, var(--accent) 32%, transparent);
  color: var(--accent);
}

.alert .material-icons {
  flex-shrink: 0;
  font-size: 17px;
}

@keyframes wallet-spin {
  to {
    transform: rotate(360deg);
  }
}

</style>
