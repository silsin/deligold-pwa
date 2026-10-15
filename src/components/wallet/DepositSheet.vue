<template>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="واریز به کیف پول">
    <div class="sheet__scrim" @click="emit('close')"></div>

    <form class="sheet__panel" @submit.prevent="submit">
      <div class="sheet__head">
        <strong>واریز به کیف پول</strong>
        <button type="button" class="sheet__x" aria-label="بستن" @click="emit('close')">
          <i class="material-icons">close</i>
        </button>
      </div>

      <span class="field__label">روش شارژ</span>
      <div class="methods" role="radiogroup" aria-label="روش شارژ">
        <button
          v-for="m in METHODS"
          :key="m.value"
          type="button"
          class="method"
          :class="{ 'is-on': method === m.value }"
          :disabled="busy"
          @click="method = m.value"
        >
          <i class="material-icons">{{ m.icon }}</i>
          {{ m.label }}
        </button>
      </div>

      <p v-if="isManual" class="sheet__hint">
        مبلغ را به حساب رسمی واریز کنید، سپس شماره پیگیری تراکنش را وارد نمایید.
      </p>
      <p v-else class="sheet__hint">
        پس از ثبت درخواست، برای پرداخت امن به درگاه بانکی منتقل می‌شوید.
      </p>

      <label class="field">
        <span class="field__label">مبلغ (تومان)</span>
        <input
          v-model="raw"
          class="field__input"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          placeholder="۰"
          :disabled="busy"
          @input="onInput"
        />
        <small v-if="amount > 0" class="field__echo">{{ faMoney(amount) }}</small>
      </label>

      <div class="chips">
        <button
          v-for="p in PRESETS"
          :key="p"
          type="button"
          class="chip"
          :class="{ 'is-on': amount === p }"
          :disabled="busy"
          @click="pick(p)"
        >
          {{ faCompact(p) }}
        </button>
      </div>

      <!-- Tracking code — required for manual transfer methods -->
      <label v-if="isManual" class="field field--gap">
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

      <!-- Optional receipt image for manual methods -->
      <div v-if="isManual" class="upload">
        <label class="upload__btn" :class="{ 'is-done': receiptPath }">
          <span class="material-icons">{{ receiptPath ? 'check_circle' : 'add_a_photo' }}</span>
          {{ uploading ? 'در حال بارگذاری…' : receiptPath ? 'رسید بارگذاری شد' : 'بارگذاری تصویر رسید (اختیاری)' }}
          <input type="file" accept="image/*,.pdf" :disabled="busy || uploading" @change="onReceipt" />
        </label>
        <small v-if="receiptName" class="upload__name">{{ receiptName }}</small>
      </div>

      <label class="field field--gap">
        <span class="field__label">توضیح (اختیاری)</span>
        <input
          v-model="note"
          class="field__input field__input--sm"
          type="text"
          maxlength="80"
          placeholder="مثلاً: واریز از حساب مشترک"
          :disabled="busy"
        />
      </label>

      <p v-if="error" class="sheet__err" role="alert">{{ error }}</p>

      <button type="submit" class="sheet__cta" :disabled="!valid || busy">
        <span v-if="busy" class="spin" aria-hidden="true"></span>
        {{ busy ? 'در حال ثبت…' : 'تأیید و واریز' }}
      </button>

      <p class="sheet__fine">
        درخواست واریز پس از تأیید کارشناس به موجودی نقد شما افزوده می‌شود.
      </p>
    </form>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { faMoney, faCompact, toFa } from '../../utils/format'
import { api } from '../../utils/api.js'

const props = defineProps({
  busy: { type: Boolean, default: false },
  initialAmount: { type: Number, default: 0 }
})
const emit = defineEmits(['close', 'submit'])

/** Step-down sizes, so the row doubles as a rough size ladder. */
const PRESETS = [500_000_000, 200_000_000, 100_000_000, 50_000_000, 10_000_000]
const CEILING = 500_000_000

/**
 * Supported charge methods. `manual` ones require a tracking code and offer a
 * receipt upload; the gateway one is handled by the backend redirect.
 * NOTE: these values are sent verbatim to POST /wallet/deposits — keep them in
 * sync with the backend's accepted `method` enum (only BANK_TRANSFER is
 * confirmed to work today).
 */
const METHODS = [
  { value: 'BANK_TRANSFER', label: 'کارت به کارت', icon: 'credit_card', manual: true },
  { value: 'CARD', label: 'درگاه بانکی', icon: 'account_balance', manual: false },
  { value: 'CRYPTO', label: 'رمزارز', icon: 'currency_bitcoin', manual: true }
]

const method = ref('BANK_TRANSFER')
const isManual = computed(() => METHODS.find(m => m.value === method.value)?.manual === true)

const raw = ref('')
const amount = ref(0)
const reference = ref('')
const note = ref('')
const receiptPath = ref('')
const receiptName = ref('')
const uploading = ref(false)
const error = ref('')

const valid = computed(() => {
  if (amount.value <= 0 || amount.value > CEILING) return false
  if (isManual.value && reference.value.trim().length < 4) return false
  return true
})

/** Pre-fill amount field when initialAmount prop is set. */
watch(
  () => props.initialAmount,
  (newVal) => {
    if (newVal > 0) {
      amount.value = newVal
      raw.value = toFa(newVal)
      error.value = ''
    }
  },
  { immediate: true }
)

/** Persian numerals are accepted: ۱۲۳ parses the same as 123. */
function parseDigits(value) {
  const kept = value.replace(/[^\d۰-۹]/g, '')
  return Number(kept.replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))) || 0
}

function onInput() {
  amount.value = parseDigits(raw.value)
  if (amount.value > CEILING) error.value = 'حداکثر مبلغ هر واریز ۵۰۰ میلیون تومان است'
  else error.value = ''
}

function pick(value) {
  amount.value = value
  raw.value = toFa(value)
  error.value = ''
}

/** Upload the chosen receipt to /uploads, mirroring the order-receipt flow. */
async function onReceipt(e) {
  const file = e.target?.files?.[0]
  if (!file) return
  uploading.value = true
  error.value = ''
  try {
    const form = new FormData()
    form.append('file', file)
    const up = await api.post('/uploads', form, { headers: { 'Content-Type': 'multipart/form-data' } })
    receiptPath.value = up?.path ?? up?.url ?? up?.filePath ?? up?.file?.path ?? ''
    if (!receiptPath.value) error.value = 'بارگذاری رسید ناموفق بود'
    else receiptName.value = file.name
  } catch (err) {
    error.value = err.message || 'بارگذاری رسید ناموفق بود'
  } finally {
    uploading.value = false
  }
}

function submit() {
  if (!valid.value || props.busy) return
  // Fold the uploaded receipt path into `note` — the deposit body stays within
  // the confirmed {amount, method, reference, note} contract, no invented fields.
  const noteParts = []
  if (note.value.trim()) noteParts.push(note.value.trim())
  if (receiptPath.value) noteParts.push(`رسید: ${receiptPath.value}`)

  emit('submit', {
    amount: amount.value,
    method: method.value,
    reference: reference.value.trim(),
    note: noteParts.join(' · ')
  })

  raw.value = ''
  amount.value = 0
  reference.value = ''
  note.value = ''
  receiptPath.value = ''
  receiptName.value = ''
  error.value = ''
}
</script>

<style scoped>
.sheet {
  position: fixed;
  inset: 0;
  z-index: 70;
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
  width: 100%;
  max-width: 520px;
  border-radius: 18px 18px 0 0;
  background: var(--card);
  border: 1px solid var(--border);
  border-bottom: none;
  padding: 12px 14px calc(16px + env(safe-area-inset-bottom));
}

.sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14.5px;
  padding: 2px 2px 8px;
}

.sheet__x {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--surface);
  color: var(--text-muted);
  font-size: 13px;
}

.sheet__hint {
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--text-muted);
  margin: 0 0 12px;
}

.field {
  display: block;
}

.field__label {
  display: block;
  font-size: 11.5px;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.field__input {
  width: 100%;
  padding: 12px 13px;
  border-radius: 11px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 17px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  outline: none;
}

.field__input:focus {
  border-color: var(--accent);
}

.field__echo {
  display: block;
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-muted);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.chip {
  padding: 7px 11px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-muted);
  font-size: 11.5px;
  font-weight: 700;
}

.chip.is-on {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.sheet__err {
  margin: 10px 0 0;
  font-size: 11.5px;
  color: var(--down);
}

.sheet__cta {
  width: 100%;
  margin-top: 14px;
  padding: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 12px;
  background: var(--accent);
  color: #fff;
  font-size: 14px;
  font-weight: 800;
}

.sheet__cta:disabled {
  opacity: 0.45;
}

.spin {
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

/* ── Charge method selector ─────────────────────────────────────────────── */
.methods {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-top: 8px;
}

.method {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 10px 6px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-muted);
  font-size: 11.5px;
  font-weight: 700;
}

.method .material-icons {
  font-size: 20px;
}

.method.is-on {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.method:disabled {
  opacity: 0.5;
}

.field--gap {
  margin-top: 12px;
}

/* ── Receipt upload ─────────────────────────────────────────────────────── */
.upload {
  margin-top: 12px;
}

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

.upload__btn input[type='file'] {
  display: none;
}

.upload__name {
  display: block;
  margin-top: 5px;
  font-size: 10.5px;
  color: var(--text-muted);
  text-align: center;
  word-break: break-all;
}

</style>
