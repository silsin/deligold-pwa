<template>
  <div class="page">
    <header class="head">
      <div>
        <h1 class="title">صف بررسی سفارش‌ها</h1>
        <p class="sub">تأیید / رد رسیدها و ثبت تحویل (ویژه همکاران)</p>
      </div>
      <button type="button" class="icon-btn material-icons" :disabled="loading" title="بازآوری" @click="load">refresh</button>
    </header>
    <div v-if="!auth.isLoggedIn" class="empty">
      <p class="empty__text">برای دیدن صف بررسی، ابتدا وارد شوید</p>
      <button type="button" class="btn btn--primary" @click="openLogin('login')">ورود</button>
    </div>
    <template v-else>
      <p v-if="auth.error" class="alert" role="alert">{{ auth.error }}</p>
      <div v-if="loading && !orders.length" class="empty empty--inline"><p class="empty__text">در حال دریافت…</p></div>
      <div v-else-if="!orders.length" class="empty empty--inline"><p class="empty__text">صف بررسی خالی است</p></div>
      <ul v-else class="queue">
        <li v-for="o in orders" :key="o.id" class="card">
          <div class="card__top">
            <b class="tnum">#{{ shortId(o.id) }} · {{ o.side === 'SELL' ? 'فروش' : 'خرید' }} {{ o.symbol }}</b>
            <span class="badge">{{ statusFa(o) }}</span>
          </div>
          <div class="card__meta tnum">{{ o.grams }} گرم<span v-if="o.totalAmount"> · {{ faMoney(o.totalAmount) }}</span></div>
          <a v-if="o.receiptUrl" class="receipt" :href="o.receiptUrl" target="_blank" rel="noopener">مشاهده رسید (/uploads)</a>
          <span v-if="o.fulfilledAt || o.fulfilled" class="badge is-done">تحویل‌شده</span>
          <input v-model="notes[o.id]" class="field__input" type="text" maxlength="200" placeholder="یادداشت بررسی" :disabled="auth.loading" />
          <div class="card__actions">
            <button type="button" class="btn btn--primary" :disabled="auth.loading" @click="review(o.id, true)">تأیید</button>
            <button type="button" class="btn" :disabled="auth.loading" @click="review(o.id, false)">رد</button>
            <button type="button" class="btn" :disabled="auth.loading || o.fulfilledAt || o.fulfilled" @click="fulfill(o.id)">ثبت تحویل</button>
          </div>
        </li>
      </ul>
    </template>
  </div>
</template>
<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { faMoney } from '../utils/format'
const auth = useAuthStore()
const orders = ref([])
const loading = ref(false)
const notes = reactive({})
const shortId = id => String(id ?? '').slice(0, 8)
function statusFa(o) {
  const s = String(o.status || '').toUpperCase()
  if (s.includes('REJECT')) return 'رد شده'
  if (s.includes('APPROV') || s.includes('CONFIRM')) return 'تأیید شده'
  if (s.includes('FULFILL')) return 'تحویل‌شده'
  return 'در انتظار بررسی'
}
async function load() {
  loading.value = true
  try { orders.value = await auth.reviewQueue() } finally { loading.value = false }
}
async function review(id, approve) {
  const { ok } = await auth.reviewOrder(id, approve, notes[id] || '')
  if (ok) await load()
}
async function fulfill(id) {
  const { ok } = await auth.fulfillOrder(id)
  if (ok) await load()
}
onMounted(() => { if (auth.isLoggedIn) load() })
</script>
