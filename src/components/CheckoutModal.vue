<template>
  <div v-if="open" class="checkout" role="dialog" aria-modal="true" aria-label="تأیید سفارش">
    <div class="checkout__scrim" @click="emit('cancel')"></div>
    <div class="checkout__panel" @click.stop>
      <span class="checkout__grip" aria-hidden="true"></span>
      <header class="checkout__head">
        <h2 class="checkout__title" :class="side === 'BUY' ? 'is-buy' : 'is-sell'">تأیید سفارش</h2>
        <button
          type="button"
          class="checkout__close material-icons"
          aria-label="بستن"
          :disabled="busy"
          @click="emit('cancel')"
        >close</button>
      </header>

      <!-- Order Details -->
      <div class="checkout__row">
        <span>{{ symbolName }} · {{ side === 'BUY' ? 'خرید' : 'فروش' }}</span>
        <b>{{ faWeight(grams) }} گرم</b>
      </div>

      <div class="checkout__row">
        <span>قیمت واحد</span>
        <b>{{ faMoney(execPrice) }} / گرم</b>
      </div>

      <div class="checkout__row">
        <span>مبلغ معامله</span>
        <b>{{ faMoney(orderTotal) }}</b>
      </div>

      <div class="checkout__row">
        <span>کارمزد</span>
        <b>{{ faMoney(orderFee) }}</b>
      </div>

      <div class="checkout__divider"></div>

      <div class="checkout__row checkout__row--total">
        <span>{{ side === 'BUY' ? 'جمع پرداختی' : 'جمع دریافتی' }}</span>
        <b>{{ faMoney(netTotal) }}</b>
      </div>

      <div class="checkout__divider"></div>

      <!-- Wallet Info -->
      <div class="checkout__row">
        <span>موجودی فعلی</span>
        <b :class="{ 'is-warning': side === 'BUY' && currentBalance < netTotal }">{{ faMoney(currentBalance) }}</b>
      </div>

      <div class="checkout__actions">
        <button
          type="button"
          class="checkout__btn checkout__btn--cancel"
          :disabled="busy"
          @click="emit('cancel')"
        >
          انصراف
        </button>
        <button
          type="button"
          class="checkout__btn checkout__btn--confirm"
          :class="side === 'BUY' ? 'is-buy' : 'is-sell'"
          :disabled="busy"
          @click="emit('confirm')"
        >
          <span v-if="busy" class="checkout__spin" aria-hidden="true"></span>
          {{ busy ? 'در حال ثبت…' : 'تأیید' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { faMoney, faWeight } from '../utils/format'

defineProps({
  open: { type: Boolean, default: false },
  symbolName: { type: String, default: '' },
  side: { type: String, default: 'BUY' },
  grams: { type: Number, default: 0 },
  execPrice: { type: Number, default: 0 },
  orderFee: { type: Number, default: 0 },
  orderTotal: { type: Number, default: 0 },
  netTotal: { type: Number, default: 0 },
  currentBalance: { type: Number, default: 0 },
  busy: { type: Boolean, default: false }
})

defineEmits(['confirm', 'cancel'])
</script>

<style scoped>
.checkout {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.checkout__scrim {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  cursor: pointer;
  z-index: 0;
  pointer-events: auto;
}

.checkout__panel {
  position: relative;
  z-index: 2;
  width: 100%;
  max-width: 520px;
  border-radius: 22px 22px 0 0;
  background: var(--card);
  border: 1px solid var(--border);
  border-bottom: none;
  padding: 14px 18px calc(22px + env(safe-area-inset-bottom));
  pointer-events: auto;
}

.checkout__grip {
  display: block;
  width: 44px;
  height: 4px;
  margin: 4px auto 12px;
  border-radius: 999px;
  background: var(--border);
}

.checkout__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.checkout__title {
  margin: 0;
  font-size: 17px;
  font-weight: 900;
}

.checkout__title.is-buy {
  color: var(--up);
}

.checkout__title.is-sell {
  color: var(--down);
}

.checkout__close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: var(--surface);
  color: var(--text-muted);
  font-size: 18px;
  border: none;
  cursor: pointer;
  padding: 0;
}

.checkout__close:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.checkout__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 2px;
  font-size: 12.5px;
  color: var(--text-muted);
}

.checkout__row b {
  color: var(--text);
  font-weight: 800;
}

.checkout__row b.is-warning {
  color: var(--down);
}

.checkout__row--total {
  font-size: 13.5px;
  margin-top: 8px;
}

.checkout__row--total b {
  color: var(--accent);
  font-weight: 900;
}

.checkout__divider {
  height: 1px;
  background: var(--border);
  margin: 8px 0;
  opacity: 0.5;
}

.checkout__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 14px;
}

.checkout__btn {
  padding: 13px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 800;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: opacity 0.2s;
}

.checkout__btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.checkout__btn--cancel {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-muted);
}

.checkout__btn--cancel:hover:not(:disabled) {
  opacity: 0.8;
}

.checkout__btn--confirm {
  background: var(--accent);
  color: #fff;
  font-weight: 900;
}

.checkout__btn--confirm.is-buy {
  background: var(--up);
}

.checkout__btn--confirm.is-sell {
  background: var(--down);
}

.checkout__btn--confirm:hover:not(:disabled) {
  opacity: 0.9;
}

.checkout__spin {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
