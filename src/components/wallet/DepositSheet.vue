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

      <p class="sheet__hint">مبلغ را به تومان وارد کنید. سقف هر واریز ۵۰۰ میلیون تومان است.</p>

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

      <p v-if="error" class="sheet__err" role="alert">{{ error }}</p>

      <button type="submit" class="sheet__cta" :disabled="!valid || busy">
        <span v-if="busy" class="spin" aria-hidden="true"></span>
        {{ busy ? 'در حال ثبت…' : 'تأیید و واریز' }}
      </button>
    </form>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { faMoney, faCompact, toFa } from '../../utils/format'

const props = defineProps({ busy: { type: Boolean, default: false } })
const emit = defineEmits(['close', 'submit'])

/** Step-down sizes, so the row doubles as a rough size ladder. */
const PRESETS = [500_000_000, 200_000_000, 100_000_000, 50_000_000, 10_000_000]

const CEILING = 500_000_000
const raw = ref('')
const amount = ref(0)
const error = ref('')

const valid = computed(() => amount.value > 0 && amount.value <= CEILING)

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

function submit() {
  if (!valid.value || props.busy) return
  emit('submit', amount.value)
  raw.value = ''
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
</style>
