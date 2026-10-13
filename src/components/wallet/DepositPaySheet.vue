<template>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="تکمیل واریز">
    <div class="sheet__scrim" @click="emit('close')"></div>

    <div v-if="deposit" class="sheet__panel">
      <div class="sheet__head">
        <strong>{{ isManual ? 'ارسال رسید واریز' : 'اتصال به درگاه بانکی' }}</strong>
        <button type="button" class="sheet__x" aria-label="بستن" @click="emit('close')">
          <i class="material-icons">close</i>
        </button>
      </div>

      <!-- Request summary -->
      <div class="sum">
        <div class="sum__row">
          <span>مبلغ</span>
          <b class="tnum">{{ faMoney(deposit.amount) }}</b>
        </div>
        <div class="sum__row">
          <span>روش</span>
          <b>{{ methodLabel }}</b>
        </div>
        <div class="sum__row">
          <span>وضعیت</span>
          <b class="sum__pending">در انتظار تکمیل</b>
        </div>
      </div>

      <template v-if="isManual">
        <p class="sheet__hint">
          مبلغ را به حساب رسمی واریز کنید، سپس شماره پیگیری و تصویر رسید را ثبت نمایید.
        </p>

        <div class="pay">
          <div class="pay__row">
            <span>شماره کارت</span>
            <b class="tnum" :class="{ 'is-copied': copied === 'card' }">{{ cardNumber }}</b>
            <button type="button" class="pay__copy" @click="copy(cardNumber, 'card')">
              {{ copied === 'card' ? 'کپی شد' : 'کپی' }}
            </button>
          </div>
          <div class="pay__row">
            <span>به نام</span>
            <b>شرکت دلی‌گلد</b>
          </div>
        </div>

        <label class="field field--gap">
          <span class="field__label">شماره پیگیری تراکنش</span>
          <input
            v-model="reference"
            class="field__input field__input--sm"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            maxlength="32"
            placeholder="مثلاً ۱۲۳۴۵۶۷۸۹"
            :disabled="busy"
          />
        </label>

        <div class="upload">
          <label class="upload__btn" :class="{ 'is-done': receiptPath }">
            <span class="material-icons">{{ receiptPath ? 'check_circle' : 'add_a_photo' }}</span>
            {{ uploading ? 'در حال بارگذاری…' : receiptPath ? 'رسید بارگذاری شد' : 'بارگذاری تصویر رسید (اختیاری)' }}
            <input type="file" accept="image/*,.pdf" :disabled="busy || uploading" @change="onReceipt" />
          </label>
          <small v-if="receiptName" class="upload__name">{{ receiptName }}</small>
        </div>

        <p v-if="error" class="sheet__err" role="alert">{{ error }}</p>

        <button type="button" class="sheet__cta" :disabled="!valid || busy" @click="submit">
          <span v-if="busy" class="spin" aria-hidden="true"></span>
          {{ busy ? 'در حال ثبت…' : 'ثبت رسید و واریز' }}
        </button>
      </template>

      <template v-else>
        <p class="sheet__hint">
          برای تکمیل پرداخت امن، به درگاه بانکی متصل می‌شوید.
        </p>

        <div class="bank">
          <span class="material-icons bank__icon">account_balance</span>
          <b>درگاه پرداخت اینترنتی</b>
          <small>پس از اتصال، مبلغ به‌صورت خودکار به کیف پول شما افزوده می‌شود.</small>
        </div>

        <p v-if="error" class="sheet__err" role="alert">{{ error }}</p>

        <button type="button" class="sheet__cta" :disabled="busy" @click="connect">

<script setup>
import { computed, ref } from 'vue'
import { faMoney } from '../../utils/format'
import { useAuthStore } from '../../stores/auth'

const props = defineProps({
  deposit: { type: Object, default: null },
  busy: { type: Boolean, default: false }
})
const emit = defineEmits(['close', 'done'])

const auth = useAuthStore()

/** Manual methods (transfer + receipt) vs the gateway method. */
const MANUAL_METHODS = ['BANK_TRANSFER', 'CRYPTO']
const isManual = computed(() => MANUAL_METHODS.includes(props.deposit?.method))

const METHOD_LABELS = {
  BANK_TRANSFER: 'کارت به کارت',
  CARD: 'درگاه بانکی',
  CRYPTO: 'رمزارز'
}
const methodLabel = computed(() => METHOD_LABELS[props.deposit?.method] ?? '—')

const cardNumber = '۶۱۰۴-۳۳۷۸-۹۹۱۲-۴۴۵۶'

const reference = ref('')
const receiptPath = ref('')
const receiptName = ref('')
const uploading = ref(false)
const error = ref('')
const copied = ref('')

const valid = computed(() => reference.value.trim().length >= 4)

async function onReceipt(e) {
  const file = e.target?.files?.[0]
  if (!file) return
  uploading.value = true
  error.value = ''
  try {
    receiptPath.value = await auth.uploadReceipt(file)
    if (receiptPath.value) receiptName.value = file.name
    else error.value = 'بارگذاری رسید ناموفق بود'
  } finally {
    uploading.value = false
  }
}

async function submit() {
  if (!valid.value || props.busy) return
  const { ok } = await auth.completeDeposit(props.deposit.id, {
    reference: reference.value.trim(),
    receiptPath: receiptPath.value
  })
  if (ok) {
    reference.value = ''
    receiptPath.value = ''
    receiptName.value = ''
    emit('done')
  }
}

async function connect() {

<style scoped>
.sheet {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet__scrim {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
}

.sheet__panel {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 460px;
  max-height: 92vh;
  overflow-y: auto;
  padding: 20px 18px 28px;
  border-radius: 20px 20px 0 0;
  background: var(--bg-secondary);
}

.sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.sheet__head strong { font-size: 16px; font-weight: 900; }

.sheet__x {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  color: var(--text-muted);
  background: var(--surface);
}

/* ── Request summary ────────────────────────────────────────────────────── */
.sum {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
  padding: 13px 14px;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: var(--card);
}

.sum__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12.5px;
  color: var(--text-muted);
}

.sum__row b { color: var(--text); font-weight: 800; }
.sum__pending { color: #d99a00; }

.sheet__hint {
  margin: 0 0 12px;
  font-size: 11.5px;
  line-height: 1.8;
  color: var(--text-muted);
}

/* ── Bank / copy rows ───────────────────────────────────────────────────── */
.pay,
.bank {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 14px;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: var(--surface);
}

.pay__row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12.5px;
}

.pay__row span { color: var(--text-muted); flex: 0 0 auto; }
.pay__row b { flex: 1; font-weight: 800; }
.pay__row b.is-copied { color: var(--accent); }


/* ── Fields / upload ────────────────────────────────────────────────────── */
.field--gap { margin-top: 12px; }

.field__label {
  display: block;
  margin-bottom: 7px;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--text-muted);
}

.field__input {
  width: 100%;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--card);
  font-size: 15px;
}

.field__input--sm { font-size: 13.5px; font-weight: 500; }
.field__input:disabled { opacity: 0.55; }

.upload { margin-top: 12px; }

.upload__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 11px 12px;
  border-radius: 11px;
  border: 1px dashed var(--border);
  background: var(--surface);
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.upload__btn.is-done {
  border-style: solid;
  border-color: var(--accent);
  color: var(--accent);
}

.upload__btn input[type='file'] { display: none; }

.upload__name {
  display: block;
  margin-top: 5px;
  font-size: 10.5px;
  color: var(--text-muted);
  text-align: center;
  word-break: break-all;
}

.sheet__err {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--down);
}

/* ── Actions ────────────────────────────────────────────────────────────── */
.sheet__cta {
  position: relative;
  width: 100%;
  margin-top: 16px;
  padding: 14px;
  border-radius: 13px;
  background: var(--accent);
  color: #fff;
  font-size: 14.5px;
  font-weight: 800;
}

.sheet__cta:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.sheet__cancel {
  width: 100%;
  margin-top: 10px;
  padding: 10px;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--text-muted);
}

.spin {
  display: inline-block;
  width: 15px;
  height: 15px;
  margin-inline-end: 6px;
  vertical-align: -3px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>

.pay__copy {
  flex: 0 0 auto;
  padding: 5px 12px;
  border-radius: 9px;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  font-size: 11px;
  font-weight: 800;
  color: var(--accent);
}

.bank { align-items: center; text-align: center; }
.bank__icon { font-size: 34px; color: var(--accent); }
.bank b { font-size: 14px; font-weight: 900; }
.bank small { font-size: 11px; color: var(--text-muted); line-height: 1.7; }

  if (props.busy) return
  await auth.connectDeposit(props.deposit.id)
}

function copy(text, key) {
  try {
    navigator.clipboard?.writeText(text)
    copied.value = key
    setTimeout(() => { copied.value = '' }, 1500)
  } catch {
    /* clipboard blocked — the number is shown in full anyway */
  }
}
</script>

          <span v-if="busy" class="spin" aria-hidden="true"></span>
          {{ busy ? 'در حال اتصال…' : 'اتصال به درگاه بانکی' }}
        </button>
      </template>

      <button type="button" class="sheet__cancel" @click="emit('close')">
        بعداً تکمیل می‌دهم (باقی می‌ماند به‌عنوان درخواست در انتظار)
      </button>
    </div>
  </div>
</template>
