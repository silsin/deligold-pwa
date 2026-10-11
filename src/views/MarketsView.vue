<template>
  <div class="page">
    <h1 class="title">بازار</h1>
    <p class="sub">قیمت لحظه‌ای نمادهای قابل معامله</p>

    <div v-if="market.loading && !market.symbols.length" class="loading">
      <span class="spinner"></span>
    </div>

    <ul v-else class="list">
      <li v-for="s in market.symbols" :key="s.symbol" class="row" @click="go(s.symbol)">
        <div class="row__main">
          <span class="row__name">{{ s.name }}</span>
          <span class="row__unit muted">{{ s.unit }}</span>
        </div>
        <div class="row__side">
          <span
            class="row__price tabular"
            :class="[flashClass(s.symbol), dirClass(s.symbol)]"
          >{{ faMoney(market.prices[s.symbol]) }}</span>
          <span v-if="prev[s.symbol]" class="row__prev muted tabular">
            قبلی {{ faCompact(prev[s.symbol]) }}
          </span>
        </div>
      </li>
    </ul>

    <div class="source">
      <span class="source__dot" :class="market.stale ? 'is-stale' : 'is-live'"></span>
      <span>{{ market.sourceTitle || '—' }}</span>
      <span class="muted">· {{ faAgo(market.updatedAt) }}</span>
    </div>

    <p v-if="market.note" class="warn">{{ market.note }}</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useMarketStore } from '../stores/market'
import { faMoney, faCompact, faAgo } from '../utils/format'

const market = useMarketStore()
const router = useRouter()

// Last tick per symbol, kept for the "قبلی" line and the flash colour.
const prev = computed(() => market.direction)

function dirClass(symbol) {
  const d = market.direction[symbol]
  return d > 0 ? 'up' : d < 0 ? 'down' : ''
}

function flashClass(symbol) {
  const d = market.direction[symbol]
  return d > 0 ? 'tick-up' : d < 0 ? 'tick-down' : ''
}

function go(symbol) {
  market.symbol = symbol
  router.push('/trade')
}
</script>

<style scoped>
.page {
  max-width: 560px;
  margin: 0 auto;
  padding: 18px 14px 28px;
}

.title {
  margin: 0;
  font-size: 21px;
  font-weight: 900;
  color: var(--accent);
}

.sub {
  margin: 4px 0 14px;
  font-size: 12.5px;
  color: var(--text-muted);
}

.loading {
  display: grid;
  place-items: center;
  padding: 48px 0;
}

.list {
  display: flex;
  flex-direction: column;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--card);
  overflow: hidden;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 13px 15px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
  transition: background 0.15s ease;
}

.row:last-child {
  border-bottom: none;
}

.row:active {
  background: var(--surface);
}

.row__main {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.row__name {
  font-size: 13.5px;
  font-weight: 700;
}

.row__unit {
  font-size: 11px;
}

.row__side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.row__price {
  font-size: 14px;
  font-weight: 800;
  border-radius: 6px;
  padding: 1px 4px;
}

.row__prev {
  font-size: 10.5px;
}

.source {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 16px;
  padding: 11px 13px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--card);
  font-size: 12px;
}

.source__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: 0 0 auto;
}

.source__dot.is-live {
  background: var(--up);
}

.source__dot.is-stale {
  background: var(--down);
}

.warn {
  margin: 10px 0 0;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--down-soft);
  color: var(--down);
  font-size: 12px;
  line-height: 1.6;
}
</style>
