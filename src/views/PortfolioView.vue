<template>
  <div class="page">
    <header class="head">
      <h1 class="head__title">سبد من</h1>
      <span class="head__sub">خلاصه دارایی‌ها و سود/زیان</span>
    </header>

    <div v-if="!auth.isLoggedIn" class="gate">
      <p>برای دیدن سبد معاملاتی ابتدا وارد شوید.</p>
      <button type="button" class="btn btn--primary" @click="$router.push('/login')">ورود</button>
    </div>

    <template v-else>
      <div class="summary">
        <div class="summary__item">
          <span class="summary__label">ارزش کل دارایی</span>
          <span class="summary__value">{{ faMoney(auth.equity) }}</span>
        </div>
        <div class="summary__item">
          <span class="summary__label">موجودی نقد</span>
          <span class="summary__value">{{ faMoney(auth.balance) }}</span>
        </div>
        <div class="summary__item">
          <span class="summary__label">سود/زیان باز</span>
          <span class="summary__value" :class="auth.totalPnl >= 0 ? 'up' : 'down'">
            {{ faDelta(auth.totalPnl) }}
          </span>
        </div>
      </div>

      <section>
        <h2 class="section-title">پوزیشن‌های باز</h2>
        <div v-if="!auth.positions.length" class="empty">پوزیشن بازی ندارید.</div>
        <ul v-else class="positions">
          <li v-for="p in auth.positions" :key="p.symbol" class="positions__row">
            <div class="positions__top">
              <span class="positions__sym">{{ symbolShort(p.symbol) }}</span>
              <span class="positions__pnl" :class="p.pnl >= 0 ? 'up' : 'down'">
                {{ faDelta(p.pnl) }} · {{ faPercent(p.pnlPercent) }}
              </span>
            </div>
            <div class="positions__meta">
              <span>وزن {{ faWeight(p.grams) }}</span>
              <span>میانگین خرید {{ faMoney(p.avgCost) }}</span>
              <span>ارزش {{ faMoney(p.marketValue) }}</span>
            </div>
            <div class="positions__actions">
              <button type="button" class="mini mini--buy" @click="quickTrade(p.symbol, 'BUY')">
                خرید بیشتر
              </button>
              <button type="button" class="mini mini--sell" @click="quickTrade(p.symbol, 'SELL')">
                فروش
              </button>
            </div>
          </li>
        </ul>
      </section>

      <section>
        <h2 class="section-title">تاریخچه معاملات</h2>
        <div v-if="!auth.orders.length" class="empty">معامله‌ای ثبت نشده است.</div>
        <ul v-else class="history">
          <li v-for="o in auth.orders" :key="o.id" class="history__row">
            <div class="history__top">
              <span class="history__side" :class="o.side === 'BUY' ? 'up' : 'down'">
                {{ o.side === 'BUY' ? 'خرید' : 'فروش' }} {{ symbolShort(o.symbol) }}
              </span>
              <span class="history__time">{{ faTime(o.createdAt) }}</span>
            </div>
            <div class="history__meta">
              <span>{{ faWeight(o.grams) }} × {{ faMoney(o.price) }}</span>
              <span>کارمزد {{ faMoney(o.fee) }}</span>
              <span v-if="o.pnl !== null" :class="o.pnl >= 0 ? 'up' : 'down'">
                {{ faDelta(o.pnl) }}
              </span>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useMarketStore } from '../stores/market'
import { faMoney, faWeight, faDelta, faPercent, faTime } from '../utils/format'

const auth = useAuthStore()
const market = useMarketStore()
const router = useRouter()

function symbolShort(symbol) {
  return market.symbols.find(s => s.symbol === symbol)?.short ?? symbol
}

/** One tap from the portfolio: jump to the board on that symbol, side preset. */
function quickTrade(symbol, side) {
  market.setSymbol(symbol)
  router.push({ path: '/trade', query: { symbol, side } })
}
</script>

<style scoped>
.page {
  max-width: 560px;
  margin: 0 auto;
  padding: 16px 14px 28px;
}

.head {
  margin-bottom: 14px;
}

.head__title {
  margin: 0;
  font-size: 20px;
  font-weight: 900;
  color: var(--accent);
}

.head__sub {
  font-size: 11.5px;
  color: var(--text-muted);
}

.gate {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 34px 18px;
  border-radius: var(--radius);
  border: 1px dashed var(--border);
  text-align: center;
  font-size: 13.5px;
  color: var(--text-muted);
}

.gate p {
  margin: 0;
}

.summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 18px;
}

.summary__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 10px;
  border-radius: var(--radius-sm);
  background: var(--card);
  border: 1px solid var(--border);
}

.summary__label {
  font-size: 10.5px;
  color: var(--text-muted);
}

.summary__value {
  font-size: 13.5px;
  font-weight: 800;
}

.positions,
.history {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.positions__row,
.history__row {
  padding: 13px 14px;
  border-radius: var(--radius);
  background: var(--card);
  border: 1px solid var(--border);
}

.positions__top,
.history__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.positions__sym,
.history__side {
  font-size: 14px;
  font-weight: 800;
}

.positions__pnl {
  font-size: 12.5px;
  font-weight: 700;
}

.positions__meta,
.history__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 7px;
  font-size: 11.5px;
  color: var(--text-muted);
}

.positions__actions {
  display: flex;
  gap: 8px;
  margin-top: 11px;
}

.mini {
  /* `min-width: 0` drops the automatic min-content floor: without it the wider
     label (خرید بیشتر) refuses to shrink and steals width from فروش. */
  flex: 1 1 0;
  min-width: 0;
  padding: 9px 0;
  border-radius: 10px;
  font-size: 12.5px;
  font-weight: 800;
  color: #fff;
}

.mini--buy {
  background: var(--up);
}

.mini--sell {
  background: var(--down);
}

.btn--primary {
  padding: 12px 26px;
  border-radius: 12px;
  background: var(--accent);
  color: #fff;
  font-weight: 800;
}

.empty {
  padding: 20px 14px;
  border-radius: var(--radius);
  border: 1px dashed var(--border);
  text-align: center;
  font-size: 13px;
  color: var(--text-muted);
}
</style>

