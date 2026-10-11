<template>
  <div class="book" :aria-label="`دفتر سفارش ${meta?.name ?? ''}`">
    <div class="book__side book__side--ask">
      <button
        v-for="row in asks"
        :key="'a' + row.price"
        type="button"
        class="book__row"
        @click="emit('pick', row.price)"
      >
        <span class="book__price is-down">{{ faMoney(row.price) }}</span>
        <span class="book__amount">{{ faWeight(row.amount) }}</span>
        <span class="book__bar book__bar--ask" :style="{ width: `${(row.amount / maxAmount) * 100}%` }"></span>
      </button>
    </div>

    <div class="book__mid">
      <span class="book__mid-price" :class="midUp ? 'is-up' : 'is-down'">
        {{ faMoney(price) }}
      </span>
      <span class="book__mid-sub">تومان / {{ meta?.unit ?? 'گرم' }}</span>
    </div>

    <div class="book__side book__side--bid">
      <button
        v-for="row in bids"
        :key="'b' + row.price"
        type="button"
        class="book__row"
        @click="emit('pick', row.price)"
      >
        <span class="book__price is-up">{{ faMoney(row.price) }}</span>
        <span class="book__amount">{{ faWeight(row.amount) }}</span>
        <span class="book__bar book__bar--bid" :style="{ width: `${(row.amount / maxAmount) * 100}%` }"></span>
      </button>
    </div>

    <p class="book__note">نمایشی (Simulation) — دفتر سفارش واقعی به‌زودی</p>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { faMoney, faWeight } from '../utils/format'

const props = defineProps({
  price: { type: Number, default: 0 },
  meta: { type: Object, default: null }
})

const emit = defineEmits(['pick'])

/**
 * Simulated depth — a real book comes from a matching engine we don't have yet.
 * Levels sit ±0.05%..±0.4% around the live price; amounts are jittered so the
 * book breathes on every tick WITHOUT drifting away from the real price.
 */
const seed = ref(Math.floor(Math.random() * 1e9))

function rand() {
  // Deterministic PRNG: re-seeding keeps renders stable inside one tick.
  let s = seed.value
  s = (s * 1664525 + 1013904223) >>> 0
  seed.value = s
  return s / 2 ** 32
}

function buildRows() {
  if (!props.price) return { asks: [], bids: [] }
  const base = props.price
  const asks = []
  const bids = []
  for (let i = 5; i >= 1; i--) {
    const jitter = 1 + (rand() - 0.5) * 0.001
    asks.push({ price: Math.round(base * (1 + i * 0.0008) * jitter), amount: 0.1 + rand() * 2.4 })
  }
  for (let i = 1; i <= 5; i++) {
    const jitter = 1 + (rand() - 0.5) * 0.001
    bids.push({ price: Math.round(base * (1 - i * 0.0008) * jitter), amount: 0.1 + rand() * 2.4 })
  }
  return { asks, bids }
}

const rows = computed(() => buildRows())
const asks = computed(() => rows.value.asks)
const bids = computed(() => rows.value.bids)

const maxAmount = computed(() => {
  const all = [...asks.value, ...bids.value].map(r => r.amount)
  return all.length ? Math.max(...all) : 1
})

const midUp = ref(true)
watch(
  () => props.price,
  (next, prev) => {
    seed.value = Math.floor(Math.random() * 1e9)
    if (prev) midUp.value = next >= prev
  }
)
</script>

<style scoped>
.book {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-variant-numeric: tabular-nums;
}

.book__side {
  display: flex;
  flex-direction: column;
}

.book__row {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  padding: 3.5px 6px;
  font-size: 11px;
  overflow: hidden;
}

.book__price {
  font-weight: 800;
}

.book__amount {
  color: var(--text-muted);
}

.book__bar {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  opacity: 0.16;
  pointer-events: none;
}

.book__bar--ask {
  background: var(--down);
}

.book__bar--bid {
  background: var(--up);
}

.book__mid {
  display: flex;
  align-items: baseline;
  gap: 5px;
  padding: 6px;
}

.book__mid-price {
  font-size: 14.5px;
  font-weight: 900;
}

.book__mid-sub {
  font-size: 9.5px;
  color: var(--text-muted);
}

.book__note {
  margin: 6px 2px 0;
  font-size: 9px;
  line-height: 1.5;
  color: var(--text-muted);
  opacity: 0.75;
}

.is-up {
  color: var(--up);
}

.is-down {
  color: var(--down);
}
</style>
