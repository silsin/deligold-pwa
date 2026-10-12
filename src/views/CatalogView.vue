<template>
  <div class="page">
    <!-- Live price source: the goldsmith must trust the number before ordering. -->
    <header class="src">
      <span class="material-icons src__icon">store</span>
      <div class="src__text">
        <strong>فروشگاه‌ها</strong>
        <small v-if="w.stores.length">
          {{ faNumber(w.stores.length) }} فروشگاه
        </small>
      </div>
      <button class="src__refresh" :disabled="w.loading" @click="w.fetchStores()">
        <span class="material-icons">refresh</span>
      </button>
    </header>

    <p v-if="w.error" class="warn">{{ w.error }}</p>

    <!-- Search + category filter -->
    <div class="filters">
      <label class="search">
        <span class="material-icons">search</span>
        <input v-model="query" type="search" placeholder="جستجوی کالا…" />
      </label>
      <div class="chips">
        <button
          v-for="c in categories"
          :key="c"
          class="chip"
          :class="{ 'chip--on': activeCat === c }"
          @click="activeCat = c"
        >
          {{ c === '' ? 'همه' : c }}
        </button>
      </div>
    </div>

    <p v-if="w.loading && !w.stores.length" class="muted">در حال دریافت فروشگاه‌ها…</p>
    <p v-else-if="!visible.length" class="muted">فروشگاهی با این جستجو پیدا نشد.</p>

    <ul v-else class="list">
      <li v-for="it in visible" :key="it.id" class="card">
        <div class="card__head">
          <div class="card__title">
            <h3>{{ it.name }}</h3>
            <span class="card__cat">{{ it.city || it.type || it.code }}</span>
          </div>
          <span v-if="it.balance != null" class="card__stock">{{ faMoney(it.balance) }}</span>
        </div>

        <button class="btn btn--ghost" @click="selectStore(it.id)">مشاهده گردش</button>

        <ul v-if="selectedId === it.id" class="list">
          <li v-for="m in movements" :key="m.id || m.createdAt" class="card">
            <span class="card__cat">{{ m.kind || m.type }} · {{ faNumber(m.amount) }}</span>
            <small v-if="m.createdAt">{{ faAgo(m.createdAt) }} · {{ faTime(m.createdAt) }}</small>
          </li>
        </ul>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useStoresStore } from '../stores/wholesale'
import { useAuthStore } from '../stores/auth'
import {
  faMoney, faAgo, faTime, faNumber
} from '../utils/format'

const w = useStoresStore()
const auth = useAuthStore()

const query = ref('')
const activeCat = ref('')
const selectedId = ref('')

/** Category chips come from the stores themselves — no hard-coded list to drift. */
const categories = computed(() => {
  const set = new Set(w.stores.map(it => it.city || it.type || it.category).filter(Boolean))
  return ['', ...set]
})

const visible = computed(() => {
  const q = query.value.trim().toLowerCase()
  return w.stores.filter(it => {
    const cat = it.city || it.type || it.category || ''
    if (activeCat.value && cat !== activeCat.value) return false
    if (!q) return true
    return (
      it.name?.toLowerCase().includes(q) ||
      cat?.toLowerCase().includes(q) ||
      it.code?.toLowerCase().includes(q)
    )
  })
})

const movements = computed(() => (selectedId.value ? (w.movementsByStore[selectedId.value] ?? []) : []))

function selectStore(id) {
  selectedId.value = id
  w.fetchMovements(id)
}

onMounted(() => {
  w.fetchStores()
})
</script>


<style scoped>
.page {
  padding: 0 12px 130px;
  max-width: 720px;
  margin: 0 auto;
}

/* ── Live price source banner ───────────────────────────────────────────── */
.src {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px 0 12px;
  padding: 11px 13px;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: var(--card);
}

.src.is-stale {
  border-color: var(--down);
}

.src__icon {
  flex: 0 0 auto;
  font-size: 20px;
  color: var(--accent);
}

.src.is-stale .src__icon {
  color: var(--down);
}

.src__text {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.src__text strong {
  font-size: 13px;
  font-weight: 700;
}

.src__text small {
  font-size: 11px;
  color: var(--text-muted);
}

.src__refresh {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
}

.src__refresh:disabled {
  opacity: .5;
}

/* ── Search + category chips ────────────────────────────────────────────── */
.filters {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 14px;
}

.search {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 13px;
  height: 44px;
  border-radius: 13px;
  border: 1px solid var(--border);
  background: var(--card);
}

.search .material-icons {
  font-size: 19px;
  color: var(--text-muted);
}

.search input {
  flex: 1;
  min-width: 0;
  border: none;
  background: none;
  outline: none;
  color: var(--text);
  font-family: var(--font-sans);
  font-size: 14px;
}

.chips {
  display: flex;
  gap: 7px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
}

.chips::-webkit-scrollbar {
  display: none;
}

.chip {
  flex: 0 0 auto;
  padding: 7px 15px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: 12.5px;
  font-weight: 700;
}

.chip--on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent);
}

.muted {
  padding: 26px 0;
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
}

.warn {
  margin: 0 0 12px;
  padding: 10px 13px;
  border-radius: 12px;
  background: var(--down-soft);
  color: var(--down);
  font-size: 12.5px;
  line-height: 1.7;
}

/* ── Catalog cards ──────────────────────────────────────────────────────── */
.list {
  display: flex;
  flex-direction: column;
  gap: 11px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 11px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: var(--card);
}

.card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.card__title h3 {
  margin: 0 0 3px;
  font-size: 15px;
  font-weight: 800;
}

.card__cat {
  font-size: 11px;
  color: var(--text-muted);
}

.card__stock {
  flex: 0 0 auto;
  padding: 4px 9px;
  border-radius: 8px;
  background: var(--surface);
  font-size: 10.5px;
  font-weight: 700;
  color: var(--text-muted);
}

/* Two price boxes side by side — unit price is the number they pay. */
.card__prices {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
}

.priceBox {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent);
}

.priceBox--muted {
  background: var(--surface);
  border-color: var(--border);
}

.priceBox__label {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--text-muted);
}

.priceBox__value {
  font-family: var(--font-num);
  font-size: 17px;
  font-weight: 800;
  line-height: 1.25;
}

.priceBox--muted .priceBox__value {
  font-size: 14px;
  color: var(--text-muted);
}

.priceBox__unit {
  font-size: 10px;
  color: var(--text-muted);
}

.gap {
  grid-column: 1 / -1;
  font-family: var(--font-num);
  font-size: 10.5px;
  font-weight: 700;
  color: var(--accent);
}
</style>

