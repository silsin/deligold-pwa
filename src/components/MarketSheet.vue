<template>
  <div class="sheet" role="dialog" aria-label="انتخاب بازار">
    <div class="sheet__scrim" @click="emit('close')"></div>
    <div class="sheet__panel">
      <div class="sheet__head">
        <strong>بازارها</strong>
        <button type="button" class="sheet__x" @click="emit('close')">
  <i class="material-icons">close</i>
</button>
      </div>
      <input v-model="query" class="sheet__search" placeholder="جستجوی نماد…" />
      <div class="sheet__cols">
        <span>جفت‌ارز</span>
        <span>آخرین قیمت</span>
        <span>تغییر ۲۴ساعته</span>
      </div>
      <ul class="sheet__list">
        <li v-for="s in filtered" :key="s.symbol">
          <button
            type="button"
            class="sheet__row"
            :class="{ 'is-on': s.symbol === current }"
            @click="emit('select', s.symbol)"
          >
            <span class="sheet__pair">
              <strong>{{ s.short }}</strong>
              <small>/ تومان</small>
            </span>
            <span class="sheet__price" :class="priceDir(s.symbol)">
              {{ faMoney(prices[s.symbol]) }}
            </span>
            <span class="sheet__chg" :class="chgClass(s.symbol)">
              {{ chgText(s.symbol) }}
            </span>
          </button>
        </li>
      </ul>
      <p v-if="!filtered.length" class="sheet__empty">نمادی پیدا نشد.</p>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { faMoney, faPercent } from '../utils/format'

const props = defineProps({
  symbols: { type: Array, default: () => [] },
  prices: { type: Object, default: () => ({}) },
  stats: { type: Object, default: () => ({}) },
  current: { type: String, default: '' },
  direction: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['close', 'select'])
const query = ref('')

const filtered = computed(() => {
  const q = query.value.trim()
  if (!q) return props.symbols
  return props.symbols.filter(
    s => s.name.includes(q) || s.short.includes(q) || s.symbol.toLowerCase().includes(q.toLowerCase())
  )
})

function priceDir(symbol) {
  const d = props.direction[symbol] ?? 0
  return d > 0 ? 'is-up' : d < 0 ? 'is-down' : ''
}

function chgClass(symbol) {
  const pct = props.stats[symbol]?.changePercent
  if (pct === undefined || pct === null) return ''
  return pct >= 0 ? 'is-up' : 'is-down'
}

function chgText(symbol) {
  const st = props.stats[symbol]
  if (!st) return '—'
  const sign = st.changePercent >= 0 ? '+' : ''
  return `${sign}${faPercent(st.changePercent)}`
}
</script>

<style scoped>
.sheet {
  position: fixed;
  inset: 0;
  z-index: 60;
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
  max-width: 560px;
  max-height: 78vh;
  display: flex;
  flex-direction: column;
  border-radius: 18px 18px 0 0;
  background: var(--card);
  border: 1px solid var(--border);
  border-bottom: none;
  padding: 12px 12px calc(14px + env(safe-area-inset-bottom));
}

.sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14.5px;
  padding: 2px 4px 10px;
}

.sheet__x {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--surface);
  color: var(--text-muted);
  font-size: 13px;
}

.sheet__search {
  padding: 10px 13px;
  margin-bottom: 8px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 13.5px;
  outline: none;
}

.sheet__search:focus {
  border-color: var(--accent);
}

.sheet__cols {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  padding: 4px 10px 6px;
  font-size: 10.5px;
  color: var(--text-muted);
}

.sheet__cols span:nth-child(2),
.sheet__cols span:nth-child(3) {
  text-align: left;
}

.sheet__list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
}

.sheet__row {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  align-items: center;
  padding: 10px;
  border-radius: 10px;
  font-variant-numeric: tabular-nums;
}

.sheet__row.is-on {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.sheet__pair {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.sheet__pair strong {
  font-size: 13.5px;
}

.sheet__pair small {
  font-size: 10px;
  color: var(--text-muted);
}

.sheet__price {
  font-size: 13px;
  font-weight: 800;
  text-align: left;
}

.sheet__chg {
  font-size: 12px;
  font-weight: 700;
  text-align: left;
}

.sheet__empty {
  text-align: center;
  color: var(--text-muted);
  font-size: 12.5px;
  padding: 16px 0 8px;
}

.is-up {
  color: var(--up);
}

.is-down {
  color: var(--down);
}
</style>
