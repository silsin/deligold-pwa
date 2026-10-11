<template>
  <div class="page">
    <!-- Live price source: the goldsmith must trust the number before ordering. -->
    <header class="src" :class="{ 'is-stale': w.stale }">
      <span class="material-icons src__icon">{{ w.stale ? 'cloud_off' : 'bolt' }}</span>
      <div class="src__text">
        <strong>{{ w.sourceTitle || 'در حال دریافت قیمت…' }}</strong>
        <small v-if="w.updatedAt">
          آخرین بروزرسانی: {{ faAgo(w.updatedAt) }} · {{ faTime(w.updatedAt) }}
        </small>
      </div>
      <button class="src__refresh" :disabled="w.loadingCatalog" @click="w.fetchCatalog()">
        <span class="material-icons">refresh</span>
      </button>
    </header>

    <p v-if="w.note" class="warn">{{ w.note }}</p>
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

    <p v-if="w.loadingCatalog && !w.items.length" class="muted">در حال دریافت کاتالوگ…</p>
    <p v-else-if="!visible.length" class="muted">کالایی با این جستجو پیدا نشد.</p>

    <ul v-else class="list">
      <li v-for="it in visible" :key="it.id" class="card">
        <div class="card__head">
          <div class="card__title">
            <h3>{{ it.name }}</h3>
            <span class="card__cat">{{ it.category }}</span>
          </div>
          <span v-if="it.stockNote" class="card__stock">{{ it.stockNote }}</span>
        </div>

        <div class="card__prices">
          <div class="priceBox">
            <span class="priceBox__label">قیمت واحد</span>
            <span class="priceBox__value bd">{{ faMoney(it.unitPrice) }}</span>
            <span class="priceBox__unit">هر {{ it.unit }}</span>
          </div>
          <div class="priceBox priceBox--muted">
            <span class="priceBox__label">پایه لحظه‌ای</span>
            <span class="priceBox__value bd">{{ faMoney(it.basePrice) }}</span>
            <span class="priceBox__unit">
              {{ it.priceMode === 'perGram' ? `${faWeight(it.gramsPerUnit)} گرم در ${it.unit}` : it.symbol }}
            </span>
          </div>
          <span v-if="it.gapPercent" class="gap">+{{ faPercent(it.gapPercent, 1) }}</span>
        </div>

        <!-- Quantity stepper: min/max come from the supplier's catalog entry. -->
        <div class="stepper">
          <button class="stepper__btn" @click="w.bump(it.id, -1, it.minQty || 1, it.maxQty || 999)">
            <span class="material-icons">remove</span>
          </button>
          <div class="stepper__field">
            <input
              :value="w.qtyOf(it.id) || ''"
              type="number"
              inputmode="numeric"
              min="0"
              :max="it.maxQty || 999"
              :placeholder="String(it.minQty || 1)"
              @input="onQty(it, $event)"
            />
            <span class="stepper__unit">{{ it.unit }}</span>
          </div>
          <button class="stepper__btn" @click="w.bump(it.id, 1, it.minQty || 1, it.maxQty || 999)">
            <span class="material-icons">add</span>
          </button>
          <span class="stepper__total bd">
            {{ faMoney((it.unitPrice || 0) * (w.qtyOf(it.id) || 0)) }}
          </span>
        </div>

        <p v-if="it.minQty > 1" class="minNote">حداقل سفارش {{ faNumber(it.minQty) }} {{ it.unit }}</p>
      </li>
    </ul>

    <!-- Basket (sticky bottom bar) -->
    <div v-if="w.basketCount" class="basket">
      <div class="basket__info">
        <strong>{{ faNumber(w.basketCount) }} قلم · {{ faNumber(w.basketQty) }} واحد</strong>
        <span class="basket__total bd">{{ faMoney(w.basketTotal) }}</span>
      </div>
      <div class="basket__actions">
        <button class="btn btn--ghost" @click="w.clearBasket()">خالی کردن</button>
        <button class="btn btn--primary" :disabled="w.submitting" @click="showReview = true">
          <span v-if="!w.submitting">ثبت سفارش</span>
          <span v-else>در حال ارسال…</span>
        </button>
      </div>
    </div>

    <!-- Review sheet: confirm the locked prices before the order is created. -->
    <div v-if="showReview" class="sheet" @click.self="showReview = false">
      <div class="sheet__panel">
        <div class="sheet__head">
          <h2>بازبینی سفارش</h2>
          <button class="sheet__close" @click="showReview = false">
            <span class="material-icons">close</span>
          </button>
        </div>

        <ul class="review">
          <li v-for="l in w.basketLines" :key="l.item.id" class="review__row">
            <div class="review__name">
              <strong>{{ l.item.name }}</strong>
              <small>{{ faNumber(l.qty) }} {{ l.item.unit }}</small>
            </div>
            <span class="review__total bd">{{ faMoney(l.lineTotal) }}</span>
          </li>
        </ul>

        <label class="note">
          <span>توضیح برای تأمین‌کننده (اختیاری)</span>
          <input v-model="orderNote" type="text" placeholder="مثلاً: تحویل فردا صبح" />
        </label>

        <div class="sum">
          <span>جمع کل</span>
          <strong class="bd">{{ faMoney(w.basketTotal) }}</strong>
        </div>

        <p v-if="!auth.isAuthenticated" class="warn">برای ثبت سفارش باید وارد شوید.</p>

        <button
          class="btn btn--primary btn--block"
          :disabled="w.submitting || !auth.isAuthenticated"
          @click="submitOrder"
        >
          <span v-if="!w.submitting">تأیید و ثبت سفارش</span>
          <span v-else>در حال ارسال…</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useWholesaleStore } from '../stores/wholesale'
import { useAuthStore } from '../stores/auth'
import {
  faMoney, faAgo, faTime, faPercent, faWeight, faNumber
} from '../utils/format'

const w = useWholesaleStore()
const auth = useAuthStore()

const query = ref('')
const activeCat = ref('')
const showReview = ref(false)
const orderNote = ref('')
const justOrdered = ref(null)

/** Category chips come from the catalog itself — no hard-coded list to drift. */
const categories = computed(() => {
  const set = new Set(w.items.map(it => it.category).filter(Boolean))
  return ['', ...set]
})

const visible = computed(() => {
  const q = query.value.trim().toLowerCase()
  return w.items.filter(it => {
    if (activeCat.value && it.category !== activeCat.value) return false
    if (!q) return true
    return (
      it.name?.toLowerCase().includes(q) ||
      it.category?.toLowerCase().includes(q) ||
      it.symbol?.toLowerCase().includes(q)
    )
  })
})

/**
 * Typed input, clamped to the supplier's min/max. Empty field is allowed while
 * the user is typing (the store drops it), so they can clear and retype.
 */
function onQty(item, event) {
  const raw = event.target.value
  if (raw === '') {
    w.removeLine(item.id)
    return
  }
  const min = item.minQty || 1
  const max = item.maxQty || 9999
  w.setQty(item.id, Math.min(max, Math.max(0, Math.round(Number(raw) || 0))))
}

async function submitOrder() {
  const order = await w.submit(orderNote.value.trim())
  if (order) {
    orderNote.value = ''
    showReview.value = false
    justOrdered.value = order
  }
}

onMounted(() => {
  w.loadEverything()
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

