<template>
  <div v-if="open" class="sheet" role="dialog" aria-modal="true" :aria-label="title">
    <div class="sheet__scrim" @click="emit('close')"></div>
    <section class="sheet__panel" @click.stop>
      <span class="sheet__grip" aria-hidden="true"></span>
      <header class="sheet__head">
        <h2 class="sheet__title" :class="side === 'BUY' ? 'is-buy' : 'is-sell'">{{ title }}</h2>
        <button type="button" class="sheet__close material-icons" aria-label="بستن" @click="emit('close')">close</button>
      </header>

      <div class="qo__sym">
        <b>{{ symbolName }}</b>
        <span class="tnum">{{ priceText }}</span>
      </div>

      <div class="qo__row">
        <span>موجودی</span>
        <b>{{ side === 'BUY' ? faMoney(auth.balance) : `${faWeight(held)} ${unit}` }}</b>
      </div>

      <label class="qo__field">
        <span>مقدار ({{ unit }})</span>
        <div class="qo__input">
          <input v-model="amount" inputmode="decimal" placeholder="0" />
          <i>{{ unit }}</i>
        </div>
      </label>

      <div class="qo__pcts">
        <button
          v-for="p in pcts"
          :key="p"
          type="button"
          :class="{ 'is-on': percent === p }"
          @click="setPercent(p)"
        >{{ toFa(p) }}٪</button>
      </div>

      <div class="qo__row"><span>قیمت معامله</span><b>{{ faMoney(execPrice) }}</b></div>
      <div class="qo__row"><span>کارمزد ({{ faPercent(auth.feePercent, 1) }})</span><b>{{ faMoney(orderFee) }}</b></div>
      <div class="qo__row qo__row--total">
        <span>{{ side === 'BUY' ? 'جمع پرداختی' : 'جمع دریافتی' }}</span>
        <b>{{ faMoney(netTotal) }}</b>
      </div>

      <p v-if="error" class="qo__msg is-err">{{ error }}</p>
      <p v-if="success" class="qo__msg is-ok">{{ success }}</p>

      <button
        type="button"
        class="qo__submit"
        :class="side === 'BUY' ? 'is-buy' : 'is-sell'"
        :disabled="!canSubmit || busy"
        @click="submit"
      >
        <i class="material-icons">{{ side === 'BUY' ? 'trending_up' : 'trending_down' }}</i>
        <span>{{ busy ? 'در حال ثبت…' : `${side === 'BUY' ? 'خرید' : 'فروش'} ${symbolShort}` }}</span>
      </button>

      <!-- Checkout and deposit modals -->
      <CheckoutModal
        :open="showCheckout"
        :symbolName="pendingOrder?.symbolName ?? ''"
        :side="pendingOrder?.side ?? props.side"
        :grams="pendingOrder?.grams ?? 0"
        :execPrice="pendingOrder?.execPrice ?? 0"
        :orderFee="pendingOrder?.orderFee ?? 0"
        :orderTotal="pendingOrder?.orderTotal ?? 0"
        :netTotal="pendingOrder?.netTotal ?? 0"
        :currentBalance="auth.balance"
        :busy="busy"
        @confirm="handleCheckoutConfirm"
        @cancel="handleCheckoutCancel"
      />
      <DepositSheet
        v-if="showDeposit"
        :busy="depositBusy"
        :initialAmount="depositAmount"
        @close="handleDepositClose"
        @submit="handleDepositSubmit"
      />
    </section>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useMarketStore } from '../stores/market'
import { useAuthStore } from '../stores/auth'
import { faMoney, faWeight, faPercent, toFa } from '../utils/format'
import CheckoutModal from '../components/CheckoutModal.vue'
import DepositSheet from '../components/wallet/DepositSheet.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  symbol: { type: String, default: '' },
  side: { type: String, default: 'BUY' },
})
const emit = defineEmits(['close', 'done'])

const market = useMarketStore()
const auth = useAuthStore()

const amount = ref('')
const percent = ref(0)
const pcts = [0, 25, 50, 75, 100]
const busy = ref(false)
const error = ref('')
const success = ref('')

// Checkout flow state
const showCheckout = ref(false)
const showDeposit = ref(false)
const depositBusy = ref(false)
const pendingOrder = ref(null) // {symbol, side, grams, execPrice, orderFee, netTotal, symbolName}
const depositAmount = ref(0)

const meta = computed(() => market.symbols.find(s => s.symbol === props.symbol) ?? market.meta)
const symbolName = computed(() => meta.value?.name ?? props.symbol)
const symbolShort = computed(() => meta.value?.short ?? props.symbol)
const unit = computed(() => meta.value?.unit ?? 'گرم')
const held = computed(() => auth.positionOf(props.symbol)?.grams ?? 0)

const execPrice = computed(() => {
  const quotes = props.side === 'BUY' ? market.buys : market.sells
  return quotes?.[props.symbol] ?? market.prices[props.symbol] ?? 0
})

const priceText = computed(() => faMoney(execPrice.value))
const title = computed(() => `${props.side === 'BUY' ? 'خرید' : 'فروش'} ${symbolShort.value}`)

const grams = computed(() => {
  const parsed = parseFloat(String(amount.value).replace(/[^\d.]/g, ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
})

const orderTotal = computed(() => Math.round(grams.value * execPrice.value))
const orderFee = computed(() => Math.round((orderTotal.value * (auth.feePercent || 0)) / 100))
const netTotal = computed(() =>
  props.side === 'BUY' ? orderTotal.value + orderFee.value : orderTotal.value - orderFee.value
)

const canSubmit = computed(() =>
  !busy.value &&
  auth.isLoggedIn &&
  grams.value > 0 &&
  execPrice.value > 0 &&
  (props.side === 'BUY' || held.value >= grams.value)
)

function setPercent(p) {
  percent.value = p
  if (p <= 0 || execPrice.value <= 0) return
  if (props.side === 'BUY') {
    const maxGrams = (auth.balance * (p / 100)) / (execPrice.value * (1 + (auth.feePercent || 0) / 100))
    amount.value = maxGrams > 0 ? maxGrams.toFixed(3) : ''
  } else {
    amount.value = (held.value * (p / 100)).toFixed(3)
  }
}

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    // Reset form only when opening the modal
    amount.value = ''
    percent.value = 0
    busy.value = false
    error.value = ''
    success.value = ''
    showCheckout.value = false
    showDeposit.value = false
    pendingOrder.value = null
  }
})

async function submit() {
  error.value = ''
  success.value = ''
  if (!auth.isLoggedIn) {
    error.value = 'برای معامله ابتدا وارد حساب شوید'
    return
  }
  if (!canSubmit.value) {
    return
  }
  busy.value = true
  try {
    // Fetch fresh wallet balance
    await auth.fetchWallet()
    
    // Snapshot the pending order
    pendingOrder.value = {
      symbol: props.symbol,
      side: props.side,
      grams: grams.value,
      execPrice: execPrice.value,
      orderTotal: orderTotal.value,
      orderFee: orderFee.value,
      netTotal: netTotal.value,
      symbolName: symbolName.value
    }
    
    // Check if balance is sufficient
    if (auth.balance >= netTotal.value) {
      showCheckout.value = true
    } else {
      depositAmount.value = Math.ceil(netTotal.value - auth.balance)
      showDeposit.value = true
    }
  } catch (e) {
    error.value = e.message || 'خطای نامشخص'
  } finally {
    busy.value = false
  }
}

async function handleCheckoutConfirm() {
  if (!pendingOrder.value) return
  busy.value = true
  try {
    const result = await auth.placeOrder({
      symbol: pendingOrder.value.symbol,
      side: pendingOrder.value.side,
      grams: pendingOrder.value.grams
    })
    if (!result.ok) {
      error.value = result.error || 'ثبت سفارش ناموفق بود'
      return
    }
    const order = result.order
    showCheckout.value = false
    pendingOrder.value = null
    if (order && (order.kind === 'MANUAL' || order.status === 'AWAITING_RECEIPT')) {
      success.value = `سفارش ${order.ref ?? ''} ثبت شد — برای بارگذاری رسید به صفحه معامله بروید`
    } else {
      success.value = `${props.side === 'BUY' ? 'خرید' : 'فروش'} ${symbolShort.value} ثبت شد`
      amount.value = ''
      percent.value = 0
    }
    await auth.fetchAccount()
    emit('done', order)
  } catch (e) {
    error.value = e.message || 'ثبت سفارش ناموفق بود'
  } finally {
    busy.value = false
  }
}

function handleCheckoutCancel() {
  showCheckout.value = false
  pendingOrder.value = null
}

async function handleDepositSubmit(payload) {
  depositBusy.value = true
  try {
    const result = await auth.requestDeposit(
      payload.amount,
      payload.method,
      payload.reference,
      payload.note
    )
    if (!result.ok) {
      error.value = result.error || 'ثبت واریز ناموفق بود'
      depositBusy.value = false
      return
    }
    await auth.fetchWallet()
    if (auth.balance >= (pendingOrder.value?.netTotal ?? 0)) {
      showDeposit.value = false
      showCheckout.value = true
    } else {
      error.value = 'درخواست واریز ثبت شد اما هنوز تأیید نشده است. پس از تأیید کارشناس، می‌توانید سفارش را ادامه دهید.'
    }
  } catch (e) {
    error.value = e.message || 'ثبت واریز ناموفق بود'
  } finally {
    depositBusy.value = false
  }
}

function handleDepositClose() {
  showDeposit.value = false
}
</script>

<style scoped>
.sheet { position: fixed; inset: 0; z-index: 60; display: flex; align-items: flex-end; justify-content: center; }
.sheet__scrim { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.55); }
.sheet__panel { position: relative; z-index: 1; width: 100%; max-width: 520px; max-height: 92dvh; overflow-y: auto; padding: 8px 18px calc(22px + env(safe-area-inset-bottom)); border-radius: 22px 22px 0 0; background: var(--bg-secondary); border: 1px solid var(--border); border-bottom: none; box-shadow: 0 -18px 46px rgba(0, 0, 0, 0.45); }
.sheet__grip { display: block; width: 44px; height: 4px; margin: 4px auto 12px; border-radius: 999px; background: var(--border); }
.sheet__head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.sheet__title { margin: 0; font-size: 17px; font-weight: 900; }
.sheet__title.is-buy { color: var(--up); }
.sheet__title.is-sell { color: var(--down); }
.sheet__close { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 9px; background: var(--surface); color: var(--text-muted); font-size: 18px; }
.qo__sym { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 12px 0; padding: 11px 13px; border-radius: 12px; border: 1px solid var(--border); background: var(--card); font-size: 13px; }
.qo__sym b { font-weight: 900; }
.qo__sym span { font-weight: 800; color: var(--accent); }
.qo__row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 7px 2px; font-size: 12.5px; color: var(--text-muted); }
.qo__row b { color: var(--text); font-weight: 800; }
.qo__row--total { border-top: 1px dashed var(--border); margin-top: 4px; padding-top: 11px; font-size: 13.5px; }
.qo__row--total b { color: var(--accent); font-weight: 900; }
.qo__field { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; font-size: 12px; font-weight: 700; color: var(--text-muted); }
.qo__input { display: flex; align-items: center; gap: 8px; padding: 4px 6px 4px 14px; border-radius: 11px; border: 1px solid var(--border); background: var(--card); }
.qo__input input { flex: 1; min-width: 0; padding: 9px 8px; background: none; border: none; color: var(--text); font: inherit; font-size: 15px; }
.qo__input input:focus { outline: none; }
.qo__input i { font-style: normal; font-size: 12px; color: var(--text-muted); }
.qo__pcts { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-top: 10px; }
.qo__pcts button { padding: 8px 0; border-radius: 9px; background: var(--surface); border: 1px solid var(--border); font-size: 12px; font-weight: 800; color: var(--text-muted); }
.qo__pcts button.is-on { background: var(--accent); border-color: var(--accent); color: #14100a; }
.qo__msg { margin: 10px 0 0; padding: 10px 12px; border-radius: 10px; font-size: 12.5px; font-weight: 700; }
.qo__msg.is-err { background: var(--down-soft); color: var(--down); }
.qo__msg.is-ok { background: var(--up-soft); color: var(--up); }
.qo__submit { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; margin-top: 14px; padding: 14px; border-radius: 13px; font-size: 15px; font-weight: 900; color: #fff; }
.qo__submit.is-buy { background: var(--up); }
.qo__submit.is-sell { background: var(--down); }
.qo__submit:disabled { opacity: 0.55; }
.qo__submit .material-icons { font-size: 20px; }
</style>