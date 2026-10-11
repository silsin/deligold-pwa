<template>
  <div class="tape" role="marquee" aria-label="نوار متحرک قیمت‌ها">
    <div class="tape__track" :style="{ animationDuration: `${duration}s` }">
      <!-- The list is rendered twice so the loop has no visible seam. -->
      <template v-for="copy in 2" :key="copy">
        <button
          v-for="s in symbols"
          :key="`${copy}-${s.symbol}`"
          type="button"
          class="tape__item"
          :class="{ 'is-on': s.symbol === current }"
          @click="emit('select', s.symbol)"
        >
          <span class="tape__name">{{ s.short }}</span>
          <span class="tape__price tnum">{{ faCompact(prices[s.symbol]) }}</span>
          <span class="tape__chg tnum" :class="chgClass(s.symbol)">
            {{ chgText(s.symbol) }}
          </span>
        </button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { faCompact, faPercent } from '../utils/format'

/**
 * Endless ticker tape. Purely decorative-plus-navigational: tapping an item
 * jumps to that symbol. Pauses on hover so a price can actually be read.
 */
const props = defineProps({
  symbols: { type: Array, default: () => [] },
  prices: { type: Object, default: () => ({}) },
  stats: { type: Object, default: () => ({}) },
  direction: { type: Object, default: () => ({}) },
  current: { type: String, default: '' },
  /** Seconds for one full pass — longer lists scroll faster. */
  duration: { type: Number, default: 34 }
})

const emit = defineEmits(['select'])

function chgClass(symbol) {
  const pct = props.stats[symbol]?.changePercent
  if (pct === undefined || pct === null) return ''
  return pct >= 0 ? 'up' : 'down'
}

function chgText(symbol) {
  const st = props.stats[symbol]
  if (!st || st.changePercent === undefined || st.changePercent === null) return ''
  return `${st.changePercent >= 0 ? '+' : ''}${faPercent(st.changePercent)}`
}
</script>

<style scoped>
.tape {
  overflow: hidden;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  /* Fade the edges so items enter and leave softly. */
  mask-image: linear-gradient(90deg, transparent, #000 24px, #000 calc(100% - 24px), transparent);
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 24px, #000 calc(100% - 24px), transparent);
}

.tape__track {
  display: flex;
  width: max-content;
  animation-name: scroll;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}

.tape:hover .tape__track {
  animation-play-state: paused;
}

@keyframes scroll {
  from {
    /* RTL: start fully off the right edge. */
    transform: translateX(50%);
  }
  to {
    transform: translateX(-50%);
  }
}

.tape__item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 15px;
  border-inline-end: 1px solid var(--border);
  white-space: nowrap;
  transition: background var(--fast) var(--ease);
}

.tape__item:active {
  background: var(--surface);
}

.tape__item.is-on .tape__name {
  color: var(--accent);
}

.tape__name {
  font-size: 11.5px;
  font-weight: 800;
  color: var(--text-muted);
}

.tape__price {
  font-size: 12px;
  font-weight: 700;
}

.tape__chg {
  font-size: 10.5px;
  font-weight: 700;
  opacity: 0.9;
}
</style>
