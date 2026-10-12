<template>
  <div class="page">
    <header class="head">
      <div>
        <h1 class="title">سفارش‌های من</h1>
        <p class="sub" v-if="orders.length">
          {{ toFa(orders.length) }} سفارش ثبت شده
        </p>
      </div>
      <button
        type="button"
        class="icon-btn material-icons"
        :class="{ 'is-busy': loading }"
        :disabled="loading"
        @click="refresh"
        title="بازآوری"
      >
        refresh
      </button>
    </header>

    <p v-if="error" class="banner banner--err material-icons">error_outline{{ error }}</p>

    <div v-if="!auth.isAuthenticated" class="empty">
      <span class="material-icons empty__icon">lock</span>
      <p class="empty__text">برای مشاهده سفارش‌ها وارد حساب خود شوید</p>
      <button type="button" class="btn btn--primary" @click="openLogin('login')">
        <span class="material-icons">login</span> ورود به حساب
      </button>
    </div>

    <div v-else-if="loading && !orders.length" class="empty">
      <span class="material-icons empty__icon spin">autorenew</span>
      <p class="empty__text">در حال دریافت سفارش‌ها…</p>
    </div>

    <div v-else-if="!orders.length" class="empty">
      <span class="material-icons empty__icon">inventory</span>
      <p class="empty__text">هنوز سفارشی ثبت نکرده‌اید</p>
      <button type="button" class="btn btn--primary" @click="$router.push('/')">
        <span class="material-icons">shopping_basket</span> رفتن به کاتالوگ
      </button>
    </div>

    <template v-else>
      <!-- Status filter chips -->
      <div class="filters" role="tablist">
        <button
          v-for="f in filters"
          :key="f.value"
          type="button"
          role="tab"
          class="chip"
          :class="{ 'chip--on': active === f.value }"
          :aria-selected="active === f.value"
          @click="active = f.value"
        >
          {{ f.label }}
          <span class="chip__count">{{ toFa(countOf(f.value)) }}</span>
        </button>
      </div>

      <div class="orders">
        <article v-for="o in visible" :key="o.id" class="order" :data-status="o.status">
          <header class="order__head">
            <div class="order__id">
              <span class="material-icons order__icon">{{ statusIcon(o.status) }}</span>
              <div>
                <strong>{{ faOrderCode(o.code) }}</strong>
                <small>{{ faJalaliDate(o.placedAt) }}</small>
              </div>
            </div>
            <span class="badge" :data-tone="statusTone(o.status)">{{ faStatus(o.status) }}</span>
          </header>

          <!-- Progress rail: 4 stages, cancelled collapses to nothing -->
          <div v-if="o.status !== 'REJECTED'" class="rail">
            <div class="rail__track"><span class="rail__fill" :style="{ width: pct(statusStep(o.status)) }"></span></div>
            <div class="rail__labels">
              <span v-for="(s, i) in stages" :key="s" :class="{ 'is-on': stepIndex(o.status) >= i }">
                {{ faStatus(s) }}
              </span>
            </div>
          </div>

          <ul class="lines">
            <li v-for="l in o.lines" :key="l.itemId" class="line">
              <span class="line__name">{{ l.name }}</span>
              <span class="line__qty">{{ faWeight(l.qty) }} {{ l.unit }}</span>
              <span class="line__amt">{{ faMoney(l.amount) }}</span>
            </li>
          </ul>

          <footer class="order__foot">
            <div class="order__total">
              <small>جمع کل</small>
              <strong>{{ faMoney(o.totalAmount) }}</strong>
            </div>
          </footer>

          <p v-if="o.note" class="order__note">
            <span class="material-icons">notes</span> {{ o.note }}
          </p>
        </article>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { toFa, faMoney, faWeight, faJalaliDate, faStatus, statusTone, statusIcon, statusStep, faOrderCode } from '../utils/format'

const router = useRouter()
const auth = useAuthStore()

const loading = computed(() => auth.loading)
const error = computed(() => auth.error)
const orders = computed(() => auth.orders ?? [])

const active = ref('ALL')

const stages = ['MANUAL', 'AWAITING_RECEIPT', 'APPROVED', 'FULFILLED']

const filters = [
  { value: 'ALL', label: 'همه' },
  { value: 'MANUAL', label: 'ثبت دستی' },
  { value: 'AWAITING_RECEIPT', label: 'در انتظار رسید' },
  { value: 'APPROVED', label: 'تأیید شده' },
  { value: 'FULFILLED', label: 'انجام شده' },
  { value: 'REJECTED', label: 'رد شده' }
]

const visible = computed(() =>
  active.value === 'ALL' ? orders.value : orders.value.filter(o => o.status === active.value)
)

function countOf(value) {
  if (value === 'ALL') return orders.value.length
  return orders.value.filter(o => o.status === value).length
}

function pct(step) {
  return `${Math.round(step * 100)}%`
}

function stepIndex(status) {
  return stages.indexOf(status)
}

async function refresh() {
  await auth.fetchOrders()
}

onMounted(() => {
  if (auth.isAuthenticated) auth.fetchOrders()
})
</script>
