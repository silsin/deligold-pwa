<template>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="برداشت از کیف پول">
    <div class="sheet__scrim" @click="emit('close')"></div>

    <form class="sheet__panel" @submit.prevent="submit">
      <div class="sheet__head">
        <strong>برداشت از کیف پول</strong>
        <button type="button" class="sheet__x" aria-label="بستن" @click="emit('close')">
          <i class="material-icons">close</i>
        </button>
      </div>

      <div class="avail">
        <small>قابل برداشت</small>
        <b class="tnum">{{ faMoney(balance) }}</b>
      </div>

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
      </label>

      <div v-if="amount > 0" class="withdraw__preview">
        {{ faMoney(amount) }}
      </div>

      <div class="chips">
        <button
          v-for="p in presets"
          :key="p"
          type="button"
          class="chip"
          :class="{ 'is-on': amount === p }"
          :disabled="busy"
          @click="pick(p)"
        >
          {{ p === balance ? 'همه' : faCompact(p) }}
        </button>
      </div>

      <label class="field field--note">
        <span class="field__label">توضیح (اختیاری)</span>
        <input
          v-model="note"
          class="field__input field__input--sm"
          type="text"
          maxlength="80"
          placeholder="مثلاً: برداشت به حساب بانکی"
          :disabled="busy"
        />
      </label>

      <p v-if="error" class="sheet__err" role="alert">
        <i class="material-icons">error_outline</i>{{ error }}
      </p>

      <button type="submit" class="sheet__cta" :disabled="!valid || busy">
        <span v-if="busy" class="spin" aria-hidden="true"></span>
        {{ busy ? 'در حال ثبت…' : 'ثبت درخواست برداشت' }}
      </button>

      <p class="sheet__fine">
        مبلغ برداشتی از موجودی نقد کم می‌شود و در گردش حساب ثبت خواهد شد.
      </p>
    </form>
  </div>
</template>


<script setup>
import { computed, ref } from 'vue'
import { faMoney, faCompact, toFa } from '../../utils/format'

const props = defineProps({
  balance: { type: Number, default: 0 },
  busy: { type: Boolean, default: false }
})
const emit = defineEmits(['close', 'submit'])

const raw = ref('')
const note = ref('')
const amount = ref(0)
const error = ref('')

/** Half / quarter / all of the balance — the useful withdrawal steps. */
const presets = computed(() => {
  const b = Math.floor(props.balance)
  const steps = [b, Math.floor(b / 2), Math.floor(b / 4)]
  return steps.filter((v, i) => v > 0 && steps.indexOf(v) === i)
})

const valid = computed(() => amount.value > 0 && amount.value <= Math.floor(props.balance))

/** Persian numerals are accepted: ۱۲۳ parses the same as 123. */
function parseDigits(value) {
  const kept = value.replace(/[^\d۰-۹]/g, '')
  return Number(kept.replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))) || 0
}

function onInput() {
  amount.value = parseDigits(raw.value)
  error.value =
    props.balance > 0 && amount.value > props.balance ? 'مبلغ برداشت از موجودی شما بیشتر است' : ''
}

function pick(value) {
  amount.value = value
  raw.value = toFa(value)
  error.value = ''
}

function submit() {
  if (!valid.value || props.busy) return
  emit('submit', { amount: amount.value, note: note.value.trim() })
  raw.value = ''
  note.value = ''
  amount.value = 0
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

.avail {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 10px 12px;
  margin-bottom: 12px;
  border-radius: 11px;
  background: var(--surface);
  border: 1px solid var(--border);
}

.avail small {
  font-size: 11.5px;
  color: var(--text-muted);
}

.avail b {
  font-size: 18px;
  font-weight: 900;
  color: var(--accent);
}

.withdraw__preview {
  margin: 10px 0 0;
  font-size: 22px;
  font-weight: 900;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  text-align: center;
  padding: 10px 0;
}

.field {
  display: block;
}

.field--note {
  margin-top: 12px;
}

.field__label {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 6px;
}

.field__input {
  width: 100%;
  padding: 14px 16px;
  border-radius: 11px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  outline: none;
}

.field__input--sm {
  font-size: 13.5px;
  font-weight: 500;
}

.field__input:focus {
  border-color: var(--accent);
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
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 10px 0 0;
  font-size: 11.5px;
  color: var(--down);
}

.sheet__err .material-icons {
  font-size: 15px;
  flex-shrink: 0;
}

.sheet__cta {
  width: 100%;
  margin-top: 14px;
  padding: 14px;
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 12px;
  background: var(--accent);
  color: #fff;
  font-size: 15px;
  font-weight: 900;
}

.sheet__cta:disabled {
  opacity: 0.45;
}

.sheet__fine {
  margin: 10px 0 0;
  font-size: 10.5px;
  line-height: 1.7;
  text-align: center;
  color: var(--text-muted);
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
</style>

