<template>
  <div class="page" dir="rtl">
    <!-- Not logged in or no broker — prompt login -->
    <div v-if="!auth.isLoggedIn || !auth.user?.brokerId" class="empty">
      <i class="material-icons empty__icon">store</i>
      <p class="empty__text">برای مشاهده فروشگاه وارد شوید</p>
      <button type="button" class="btn btn--primary" @click="openLogin('login')">
        <i class="material-icons">login</i> ورود به حساب
      </button>
    </div>

    <!-- Loading -->
    <div v-else-if="brokerStore.loading" class="empty">
      <i class="material-icons empty__icon spin">autorenew</i>
      <p class="empty__text">در حال دریافت اطلاعات فروشگاه…</p>
    </div>

    <!-- Error -->
    <div v-else-if="brokerStore.error && !brokerStore.store" class="empty">
      <i class="material-icons empty__icon">error_outline</i>
      <p class="empty__text">{{ brokerStore.error }}</p>
      <button type="button" class="btn btn--primary" @click="brokerStore.fetchMyBrokerStore()">
        <i class="material-icons">refresh</i> تلاش دوباره
      </button>
    </div>

    <!-- No store found -->
    <div v-else-if="!brokerStore.store" class="empty">
      <i class="material-icons empty__icon">store_mall_directory</i>
      <p class="empty__text">فروشگاهی برای این کارگزاری تعریف نشده است</p>
    </div>

    <!-- Store content -->
    <template v-else>
      <header class="store-header">
        <img
          v-if="brokerStore.store.logoPath"
          :src="logoUrl"
          alt="لوگوی فروشگاه"
          class="store-header__logo"
        />
        <div v-else class="store-header__logo-placeholder">
          <i class="material-icons">store</i>
        </div>
        <div class="store-header__info">
          <h1 class="store-header__name">{{ brokerStore.store.name }}</h1>
          <p v-if="brokerStore.store.description" class="store-header__desc">
            {{ brokerStore.store.description }}
          </p>
          <div v-if="brokerStore.store.phone" class="store-header__row">
            <i class="material-icons">phone</i>
            <span>{{ brokerStore.store.phone }}</span>
          </div>
          <div v-if="brokerStore.store.address" class="store-header__row">
            <i class="material-icons">location_on</i>
            <span>{{ brokerStore.store.address }}</span>
          </div>
        </div>
      </header>

      <section class="products">
        <h2 class="products__title"><i class="material-icons">inventory_2</i> محصولات</h2>

        <div v-if="brokerStore.products.length === 0" class="empty">
          <i class="material-icons empty__icon">inbox</i>
          <p class="empty__text">محصولی تعریف نشده است</p>
        </div>

        <div v-else class="products__list">
          <div v-for="p in brokerStore.products" :key="p.id" class="product-card">
            <div class="product-card__head">
              <span class="product-card__name">{{ p.name }}</span>
              <span v-if="p.price != null" class="product-card__price">
                {{ faMoney(p.price, p.unit || 'تومان') }}
              </span>
            </div>
            <p v-if="p.description" class="product-card__desc">{{ p.description }}</p>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth.js'
import { useBrokerStore } from '../stores/brokerStore.js'
import { faMoney } from '../utils/format.js'
import { apiBase } from '../utils/api.js'
import { openLogin } from '../utils/authGate.js'

const auth = useAuthStore()
const brokerStore = useBrokerStore()

const logoUrl = computed(() => {
  if (!brokerStore.store?.logoPath) return ''
  const base = apiBase.replace(/\/$/, '')
  return `${base}/${brokerStore.store.logoPath}`
})

onMounted(() => {
  if (auth.isLoggedIn && auth.user?.brokerId) {
    brokerStore.fetchMyBrokerStore()
  }
})
</script>

<style scoped>
.page {
  max-width: 600px;
  margin: 0 auto;
  padding: 16px 14px 40px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Empty / loading states ── */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 18px;
  border-radius: 14px;
  border: 1px dashed var(--border);
  text-align: center;
}

.empty__icon {
  font-size: 38px;
  color: var(--text-muted);
}

.empty__text {
  margin: 0;
  font-size: 13.5px;
  color: var(--text-muted);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ── Store header ── */
.store-header {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  padding: 16px;
  border-radius: 14px;
  background: var(--card);
  border: 1px solid var(--border);
}

.store-header__logo {
  width: 80px;
  height: 80px;
  border-radius: 12px;
  object-fit: cover;
  flex-shrink: 0;
  border: 1px solid var(--border);
}

.store-header__logo-placeholder {
  width: 80px;
  height: 80px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--text-muted);
}

.store-header__logo-placeholder .material-icons {
  font-size: 40px;
}

.store-header__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.store-header__name {
  margin: 0;
  font-size: 18px;
  font-weight: 900;
  color: var(--accent);
}

.store-header__desc {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-muted);
  line-height: 1.7;
}

.store-header__row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--text-muted);
}

.store-header__row .material-icons {
  font-size: 16px;
  color: var(--accent);
}

/* ── Products ── */
.products {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.products__title {
  margin: 0;
  font-size: 14px;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 6px;
}

.products__title .material-icons {
  font-size: 18px;
  color: var(--accent);
}

.products__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.product-card {
  padding: 13px 14px;
  border-radius: 12px;
  background: var(--card);
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.product-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.product-card__name {
  font-size: 13.5px;
  font-weight: 800;
}

.product-card__price {
  font-size: 13px;
  font-weight: 800;
  color: var(--accent);
  white-space: nowrap;
}

.product-card__desc {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.7;
}

/* ── Buttons ── */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
}

.btn .material-icons {
  font-size: 18px;
}

.btn--primary {
  padding: 12px 20px;
  border-radius: 12px;
  background: var(--accent);
  color: #fff;
  font-size: 14px;
  font-weight: 800;
}
</style>
