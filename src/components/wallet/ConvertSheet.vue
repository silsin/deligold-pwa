<template>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="ØªØ¨Ø¯ÛŒÙ„ Ø·Ù„Ø§">
    <div class="sheet__scrim" @click="emit('close')"></div>

    <form class="sheet__panel" @submit.prevent="submit">
      <div class="sheet__head">
        <strong>ØªØ¨Ø¯ÛŒÙ„ Ø·Ù„Ø§</strong>
        <button type="button" class="sheet__x" aria-label="Ø¨Ø³ØªÙ†" @click="emit('close')">
          <i class="material-icons">close</i>
        </button>
      </div>

      <!-- Source â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ -->
      <label class="field">
        <span class="field__label">Ø§Ø²</span>
        <select v-model="from" class="field__input field__input--sm" :disabled="busy" @change="onFrom">
          <option v-if="!holdings.length" value="">Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ø·Ù„Ø§ÛŒÛŒ Ù†Ø¯Ø§Ø±ÛŒØ¯</option>
          <option v-for="h in holdings" :key="h.symbol" :value="h.symbol">
            {{ nameOf(h.symbol) }} â€” {{ faWeight(h.grams) }} {{ unitOf(h.symbol) }}
          </option>
        </select>
      </label>

      <div class="swap">
        <span class="material-icons" aria-hidden="true">arrow_downward</span>
      </div>

      <!-- Target â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ -->
      <label class="field">
        <span class="field__label">Ø¨Ù‡</span>
        <select v-model="to" class="field__input field__input--sm" :disabled="busy || !from">
          <option value="">Ø§Ù†ØªØ®Ø§Ø¨ Ù†Ù…Ø§Ø¯ Ù…Ù‚ØµØ¯â€¦</option>
          <option v-for="s in targets" :key="s.symbol" :value="s.symbol">
            {{ s.name || s.symbol }}
          </option>
        </select>
      </label>

      <!-- Weight â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ -->
      <label class="field field--mt">
        <span class="field__label">
          ÙˆØ²Ù† Ø¨Ø±Ø§ÛŒ ØªØ¨Ø¯ÛŒÙ„
          <small v-if="maxGrams > 0" class="field__max">
            Ø­Ø¯Ø§Ú©Ø«Ø± {{ faWeight(maxGrams) }} {{ unitOf(from) }}
          </small>
        </span>
        <input
          v-model="raw"
          class="field__input"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          placeholder="Û°"
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

      <!-- Quote preview â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ -->
      <div v-if="quote" class="quote">
        <div class="quote__row">
          <span>ÙØ±ÙˆØ´ {{ nameOf(from) }}</span>
          <b class="tnum">{{ faMoney(quote.grossAmount) }}</b>
        </div>
        <div class="quote__row quote__row--fee">
          <span>Ú©Ø§Ø±Ù…Ø²Ø¯</span>
          <b class="tnum">âˆ’{{ faMoney(quote.fee) }}</b>
        </div>
        <div class="quote__row quote__row--net">
          <span>Ø®Ø±ÛŒØ¯ {{ nameOf(to) }}</span>
          <b class="tnum">{{ faWeight(quote.gramsIn) }} {{ unitOf(to) }}</b>
        </div>
      </div>

      <p v-if="error" class="sheet__err" role="alert">{{ error }}</p>

      <button type="submit" class="sheet__cta" :disabled="!canSubmit || busy">
        <span v-if="busy" class="spin" aria-hidden="true"></span>
        {{ busy ? 'Ø¯Ø± Ø­Ø§Ù„ ØªØ¨Ø¯ÛŒÙ„â€¦' : 'ØªØ£ÛŒÛŒØ¯ ØªØ¨Ø¯ÛŒÙ„' }}
      </button>

      <p class="sheet__fine">
        ØªØ¨Ø¯ÛŒÙ„ Ø¨Ø¯ÙˆÙ† ØªØºÛŒÛŒØ± Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ù†Ù‚Ø¯ Ø§Ù†Ø¬Ø§Ù… Ù…ÛŒâ€ŒØ´ÙˆØ¯Ø› Ú©Ø§Ø±Ù…Ø²Ø¯ Ø§Ø² Ø§Ø±Ø²Ø´ ÙØ±ÙˆØ´ Ú©Ø³Ø± Ù…ÛŒâ€ŒÚ¯Ø±Ø¯Ø¯.
      </p>
    </form>
  </div>
</template>


<script setup>
import { computed, ref, watch } from 'vue'
import { faMoney, faWeight, faPercent } from '../../utils/format'

const props = defineProps({
  /** Holdings the user actually owns â€” the only valid sources. */
  holdings: { type: Array, default: () => [] },
  /** Every tradeable symbol, so the user can convert into something new. */
  symbols: { type: Array, default: () => [] },
  prices: { type: Object, default: () => ({}) },
  feePercent: { type: Number, default: 0.5 },
  busy: { type: Boolean, default: false },
  /** Symbol the user tapped Â«ØªØ¨Ø¯ÛŒÙ„Â» on, so the sheet opens pre-filled. */
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
const nameOf = symbol => metaOf(symbol)?.name ?? symbol ?? 'â€”'
const unitOf = symbol => metaOf(symbol)?.unit ?? 'Ú¯Ø±Ù…'

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
  const kept = value.replace(/[^\dÛ°-Û¹.]/g, '').replace(/[Û°-Û¹]/g, d =>
    String('Û°Û±Û²Û³Û´ÛµÛ¶Û·Û¸Û¹'.indexOf(d))
  )
  return Number(kept) || 0
}

function onInput() {
  grams.value = parseWeight(raw.value)
  if (maxGrams > 0 && grams.value > maxGrams + 1e-9)
    error.value = 'ÙˆØ²Ù† Ø¯Ø±Ø®ÙˆØ§Ø³ØªÛŒ Ø§Ø² Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ø´Ù…Ø§ Ø¨ÛŒØ´ØªØ± Ø§Ø³Øª'
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

