<template>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="تبدیل طلا">
    <div class="sheet__scrim" @click="emit('close')"></div>

    <form class="sheet__panel" @submit.prevent="submit">
      <div class="sheet__head">
        <strong>تبدیل طلا</strong>
        <button type="button" class="sheet__x" aria-label="بستن" @click="emit('close')">
          <i class="material-icons">close</i>
        </button>
      </div>

      <!-- Source ───────────────────────────────────────────────────────────── -->
      <label class="field">
        <span class="field__label">از</span>
        <select v-model="from" class="field__input field__input--sm" :disabled="busy" @change="onFrom">
          <option v-if="!holdings.length" value="">موجودی طلایی ندارید</option>
          <option v-for="h in holdings" :key="h.symbol" :value="h.symbol">
            {{ nameOf(h.symbol) }} — {{ faWeight(h.grams) }} {{ unitOf(h.symbol) }}
          </option>
        </select>
      </label>

      <div class="swap">
        <span class="material-icons" aria-hidden="true">arrow_downward</span>
      </div>

      <!-- Target ───────────────────────────────────────────────────────────── -->
      <label class="field">
        <span class="field__label">به</span>
        <select v-model="to" class="field__input field__input--sm" :disabled="busy || !from">
          <option value="">انتخاب نماد مقصد…</option>
          <option v-for="s in targets" :key="s.symbol" :value="s.symbol">
            {{ s.name || s.symbol }}
          </option>
        </select>
      </label>

      <!-- Weight ───────────────────────────────────────────────────────────── -->
      <label class="field field--mt">
        <span class="field__label">
          وزن برای تبدیل
          <small v-if="maxGrams > 0" class="field__max">
            حداکثر {{ faWeight(maxGrams) }} {{ unitOf(from) }}
          </small>
        </span>
        <input
          v-model="raw"
          class="field__input"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          placeholder="۰"
          :disabled="busy"
          @input="onInput"
        />
      </label>

      <div class="chips">
        <button
          v-for="f of FRACTIONS"
          :key="f"
          type="button"
          class="chip"
          :disabled="busy || maxGrams <= 0"
          @click="pickFraction(f)"
        >
          {{ faPercent(f * 100, 0) }}
        </button>
      </div>

      <!-- Quote preview ────────────────────────────────────────────────────── -->
      <div v-if="quote" class="quote">
        <div class="quote__row">
          <span>فروش {{ nameOf(from) }}</span>
          <b class="tnum">{{ faMoney(quote.grossAmount) }}</b>
        </div>
        <div class="quote__row quote__row--fee">
          <span>کارمزد</span>
          <b class="tnum">−{{ faMoney(quote.fee) }}</b>
        </div>
        <div class="quote__row quote__row--net">
          <span>خرید {{ nameOf(to) }}</span>
          <b class="tnum">{{ faWeight(quote.gramsIn) }} {{ unitOf(to) }}</b>
        </div>
      </div>

      <p v-if="error" class="sheet__err" role="alert">
        <i class="material-icons">error_outline</i>{{ error }}
      </p>

      <button type="submit" class="sheet__cta" :disabled="!canSubmit || busy">
        <span v-if="busy" class="spin" aria-hidden="true"></span>
        {{ busy ? 'در حال تبدیل…' : 'تأیید تبدیل' }}
      </button>

      <p class="sheet__fine">
        تبدیل بدون تغییر موجودی نقد انجام می‌شود؛ کارمزد از ارزش فروش کسر می‌گردد.
      </p>
    </form>
  </div>
</template>


<script setup>
import { computed, ref, watch } from 'vue'
import { faMoney, faWeight, faPercent } from '../../utils/format'

const props = defineProps({
  /** Holdings the user actually owns — the only valid sources. */
  holdings: { type: Array, default: () => [] },
  /** Every tradeable symbol, so the user can convert into something new. */
  symbols: { type: Array, default: () => [] },
  prices: { type: Object, default: () => ({}) },
  feePercent: { type: Number, default: 0.5 },
  busy: { type: Boolean, default: false },
  /** Symbol the user tapped «تبدیل» on, so the sheet opens pre-filled. */
  presetFrom: { type: String, default: '' }
})
const emit = defineEmits(['close', 'submit'])

const FRACTIONS = [0.25, 0.5, 0.75, 1]

const from = ref('')
const to = ref('')
const raw = ref('')
const grams = ref(0)
const error = ref('')

const metaOf = symbol => props.symbols.find(s => s.symbol === symbol)
const nameOf = symbol => metaOf(symbol)?.name ?? symbol ?? '—'
const unitOf = symbol => metaOf(symbol)?.unit ?? 'گرم'

/** Destination list excludes the source, so a no-op swap can't be submitted. */
const targets = computed(() => props.symbols.filter(s => s.symbol !== from.value))

const source = computed(() => props.holdings.find(h => h.symbol === from.value) ?? null)
const maxGrams = computed(() => source.value?.grams ?? 0)

/**
 * Quote preview. Mirrors the server's arithmetic (one fee, on the liquidation
 * leg) so the number shown is the number delivered. The server re-computes it
 * from its own board, so this is a preview and never the authority.
 */
const quote = computed(() => {
  if (grams.value <= 0 || !from.value || !to.value) return null
  const priceOut = props.prices[from.value]
  const priceIn = props.prices[to.value]
  if (!priceOut || !priceIn) return null

  const grossAmount = Math.round(grams.value * priceOut)
  const fee = Math.round((grossAmount * props.feePercent) / 100)
  const gramsIn = (grossAmount - fee) / priceIn
  if (gramsIn <= 1e-9) return null
  return { grossAmount, fee, gramsIn }
})

const canSubmit = computed(
  () => Boolean(from.value) && Boolean(to.value) && from.value !== to.value && grams.value > 0
)

/** Pre-select whatever the user tapped, and clear any stale target. */
watch(
  () => props.presetFrom,
  symbol => {
    from.value = props.holdings.some(h => h.symbol === symbol) ? symbol : ''
    to.value = ''
    raw.value = ''
    grams.value = 0
    error.value = ''
  },
  { immediate: true }
)

function onFrom() {
  to.value = ''
  raw.value = ''
  grams.value = 0
  error.value = ''
}

/** Accepts Persian digits and a dot; anything else is dropped as you type. */
function parseWeight(value) {
  const kept = value.replace(/[^\d۰-۹.]/g, '').replace(/[۰-۹]/g, d =>
    String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
  )
  return Number(kept) || 0
}

function onInput() {
  grams.value = parseWeight(raw.value)
  if (maxGrams > 0 && grams.value > maxGrams + 1e-9)
    error.value = 'وزن درخواستی از موجودی شما بیشتر است'
  else error.value = ''
}

function pickFraction(fraction) {
  const value = Math.floor(maxGrams * fraction * 1000) / 1000
  grams.value = value
  raw.value = String(value)
  error.value = ''
}

function submit() {
  if (!canSubmit.value || props.busy) return
  emit('submit', { fromSymbol: from.value, toSymbol: to.value, grams: grams.value })
  raw.value = ''
  grams.value = 0
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
  max-height: 90vh;
  overflow-y: auto;
}

.sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14.5px;
  font-weight: 900;
  padding: 2px 2px 12px;
}

.sheet__x {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--surface);
  color: var(--text-muted);
}

.field {
  display: block;
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
  padding: 13px 14px;
  border-radius: 11px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 15px;
  outline: none;
  font-variant-numeric: tabular-nums;
}

.field__input:focus {
  border-color: var(--accent);
}

.field__max {
  font-size: 10.5px;
  color: var(--text-muted);
  font-weight: 600;
  margin-inline-start: 6px;
}

.field--mt {
  margin-top: 14px;
}

.swap {
  display: flex;
  justify-content: center;
  padding: 8px 0;
  color: var(--text-muted);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.chip {
  padding: 7px 13px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-muted);
  font: inherit;
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
}

.chip:disabled {
  opacity: 0.45;
  cursor: default;
}

.quote {
  margin-top: 14px;
  padding: 13px 14px;
  border-radius: 14px;
  border: 1px solid var(--border);
  border-inline-start: 3px solid var(--accent);
  background: var(--surface);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quote__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
}

.quote__row span {
  color: var(--text-muted);
}

.quote__row b {
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.quote__row--fee b {
  color: var(--down);
}

.quote__row--net b {
  color: var(--up);
  font-size: 15px;
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
  font: inherit;
  font-size: 15px;
  font-weight: 900;
}

.sheet__cta:disabled {
  opacity: 0.45;
  cursor: not-allowed;
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
  to { transform: rotate(360deg); }
}
</style>

