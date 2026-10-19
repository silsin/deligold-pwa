<template>
  <div class="page" dir="rtl">
    <header class="head">
      <div>
        <h1 class="title">تنظیمات فروشگاه</h1>
        <p class="sub">نام، توضیحات، لوگو و محصولات فروشگاه شما</p>
      </div>
      <button type="button" class="icon-btn material-icons" :class="{ 'is-busy': loading }" :disabled="loading" title="بازآوری" @click="loadAll">refresh</button>
    </header>

    <!-- No store yet -->
    <div v-if="!loading && !storeId" class="empty">
      <i class="material-icons empty__icon">store_mall_directory</i>
      <p class="empty__text">هنوز فروشگاهی ثبت نشده است؛ ابتدا یک فروشگاه بسازید.</p>
      <button type="button" class="btn btn--primary" @click="router.push('/stores')">
        <i class="material-icons">storefront</i> ایجاد فروشگاه
      </button>
    </div>

    <template v-else>
      <!-- Loading -->
      <div v-if="loading && !store" class="empty">
        <i class="material-icons empty__icon spin">autorenew</i>
        <p class="empty__text">در حال دریافت اطلاعات…</p>
      </div>

      <p v-if="error" class="msg msg--err">{{ error }}</p>

      <!-- Form 1: store details -->
      <section class="pane">
        <h2 class="section-title">اطلاعات فروشگاه</h2>
        <label class="pay__label" for="st-name">نام</label>
        <input id="st-name" v-model="form.name" type="text" class="pay__input tnum" />
        <label class="pay__label" for="st-desc">توضیحات</label>
        <textarea id="st-desc" v-model="form.description" class="pay__textarea" rows="3"></textarea>
        <label class="pay__label" for="st-phone">تلفن</label>
        <input id="st-phone" v-model="form.phone" type="text" class="pay__input tnum" />
        <label class="pay__label" for="st-address">آدرس</label>
        <textarea id="st-address" v-model="form.address" class="pay__textarea" rows="2"></textarea>
        <p v-if="storeOk" class="msg msg--ok">اطلاعات فروشگاه ذخیره شد.</p>
        <p v-if="storeError" class="msg msg--err">{{ storeError }}</p>
        <button type="button" class="btn btn--primary btn--block" :disabled="storeSaving" @click="saveStore">
          <i class="material-icons">{{ storeSaving ? 'autorenew' : 'save' }}</i>
          {{ storeSaving ? 'در حال ذخیره…' : 'ذخیره اطلاعات' }}
        </button>
      </section>

      <!-- Form 2: logo upload -->
      <section class="pane">
        <h2 class="section-title">لوگوی فروشگاه</h2>
        <div v-if="logoPreview" class="logo-preview">
          <img :src="logoPreview" alt="لوگوی فروشگاه" class="logo-preview__img" />
        </div>
        <label class="logo-upload" :class="{ 'is-busy': logoUploading }">
          <input type="file" accept="image/jpeg,image/png,image/webp" :disabled="logoUploading" @change="onLogoChange" />
          <i class="material-icons">{{ logoUploading ? 'autorenew' : 'upload' }}</i>
          {{ logoUploading ? 'در حال بارگذاری…' : 'تغییر لوگو' }}
        </label>
        <p v-if="logoError" class="msg msg--err">{{ logoError }}</p>
        <p v-if="logoOk" class="msg msg--ok">لوگو با موفقیت بارگذاری شد.</p>
      </section>

      <!-- Form 3: products -->
      <section class="pane">
        <h2 class="section-title">محصولات</h2>

        <div v-if="products.length === 0" class="empty empty--sm">
          <p class="empty__text">هنوز محصولی اضافه نشده است.</p>
        </div>

        <div v-else class="products">
          <div v-for="p in products" :key="p.id" class="product-row">
            <div class="product-row__body">
              <span class="product-row__name">{{ p.name }}</span>
              <span v-if="p.price != null" class="product-row__price">{{ faMoney(p.price, p.unit || 'تومان') }}</span>
            </div>
            <div class="product-row__actions">
              <button
                type="button"
                class="toggle"
                :class="{ 'toggle--on': p.active }"
                :disabled="productBusy === p.id"
                :title="p.active ? 'فعال' : 'غیرفعال'"
                @click="toggleProduct(p)"
              >
                <i class="material-icons">{{ p.active ? 'toggle_on' : 'toggle_off' }}</i>
              </button>
              <button type="button" class="del" :disabled="productBusy === p.id" @click="removeProduct(p)">
                <i class="material-icons">delete</i>
              </button>
            </div>
          </div>
        </div>

        <div class="add-form">
          <label class="pay__label" for="p-name">نام محصول</label>
          <input id="p-name" v-model="newProduct.name" type="text" class="pay__input tnum" />
          <label class="pay__label" for="p-desc">توضیحات</label>
          <textarea id="p-desc" v-model="newProduct.description" class="pay__textarea" rows="2"></textarea>
          <div class="add-form__row">
            <div class="add-form__cell">
              <label class="pay__label" for="p-price">قیمت (تومان)</label>
              <input id="p-price" v-model="newProduct.price" type="text" inputmode="numeric" class="pay__input tnum" @input="onPriceInput" />
            </div>
            <div class="add-form__cell">
              <label class="pay__label" for="p-unit">واحد</label>
              <input id="p-unit" v-model="newProduct.unit" type="text" class="pay__input tnum" placeholder="تومان" />
            </div>
          </div>
          <label class="check">
            <input v-model="newProduct.active" type="checkbox" />
            <span>فعال</span>
          </label>
          <button type="button" class="btn btn--primary btn--block" :disabled="productAdding || !newProduct.name.trim()" @click="addProduct">
            <i class="material-icons">{{ productAdding ? 'autorenew' : 'add' }}</i>
            {{ productAdding ? 'در حال افزودن…' : 'افزودن محصول' }}
          </button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, apiBase } from '../utils/api.js'
import { faMoney } from '../utils/format.js'

const router = useRouter()

const loading = ref(false)
const error = ref('')
const storeId = ref('')
const store = ref(null)

// Store details form
const form = reactive({ name: '', description: '', phone: '', address: '' })
const storeSaving = ref(false)
const storeError = ref('')
const storeOk = ref(false)

// Logo upload
const logoUploading = ref(false)
const logoError = ref('')
const logoOk = ref(false)

// Products
const products = ref([])
const productBusy = ref('')
const productAdding = ref(false)
const newProduct = reactive({ name: '', description: '', price: '', unit: '', active: true })

const logoPreview = ref('')

function buildLogoUrl(path) {
  if (!path) return ''
  return `${apiBase.replace(/\/$/, '')}/${path}`
}

async function loadAll() {
  loading.value = true
  error.value = ''
  try {
    const stores = await api.get('/stores')
    const first = Array.isArray(stores) && stores.length ? stores[0] : null
    store.value = first
    storeId.value = first?.id ?? ''

    if (first) {
      form.name = first.name ?? ''
      form.description = first.description ?? ''
      form.phone = first.phone ?? ''
      form.address = first.address ?? ''
      logoPreview.value = buildLogoUrl(first.logoPath)
    }

    if (storeId.value) {
      products.value = await api.get(`/stores/${storeId.value}/products`)
    }
  } catch (e) {
    error.value = e?.message || 'دریافت اطلاعات فروشگاه ناموفق بود'
  } finally {
    loading.value = false
  }
}

async function saveStore() {
  if (!storeId.value) return
  storeSaving.value = true
  storeError.value = ''
  storeOk.value = false
  try {
    const data = await api.patch(`/stores/${storeId.value}`, {
      name: form.name,
      description: form.description,
      phone: form.phone,
      address: form.address,
    })
    if (data?.id) {
      store.value = data
      storeOk.value = true
    }
  } catch (e) {
    storeError.value = e?.message || 'ذخیره اطلاعات ناموفق بود'
  } finally {
    storeSaving.value = false
  }
}

async function onLogoChange(ev) {
  const file = ev.target.files?.[0]
  if (!file) return
  logoUploading.value = true
  logoError.value = ''
  logoOk.value = false
  try {
    const formData = new FormData()
    formData.append('file', file)
    const data = await api.post(`/stores/${storeId.value}/logo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    if (data?.logoPath) {
      logoPreview.value = buildLogoUrl(data.logoPath)
      logoOk.value = true
    }
  } catch (e) {
    logoError.value = e?.message || 'بارگذاری لوگو ناموفق بود'
  } finally {
    logoUploading.value = false
    ev.target.value = ''
  }
}

async function loadProducts() {
  if (!storeId.value) return
  try {
    products.value = await api.get(`/stores/${storeId.value}/products`)
  } catch (e) {
    error.value = e?.message || 'دریافت محصولات ناموفق بود'
  }
}

async function toggleProduct(p) {
  productBusy.value = p.id
  try {
    await api.patch(`/stores/${storeId.value}/products/${p.id}`, { active: !p.active })
    await loadProducts()
  } catch (e) {
    error.value = e?.message || 'تغییر وضعیت ناموفق بود'
  } finally {
    productBusy.value = ''
  }
}

async function removeProduct(p) {
  if (!confirm('این محصول حذف شود؟')) return
  productBusy.value = p.id
  try {
    await api.delete(`/stores/${storeId.value}/products/${p.id}`)
    await loadProducts()
  } catch (e) {
    error.value = e?.message || 'حذف محصول ناموفق بود'
  } finally {
    productBusy.value = ''
  }
}

function onPriceInput(ev) {
  const digits = String(ev.target.value).replace(/[^\d.]/g, '')
  newProduct.price = digits
}

async function addProduct() {
  const name = newProduct.name.trim()
  if (!name) return
  productAdding.value = true
  error.value = ''
  try {
    const payload = {
      name,
      description: newProduct.description.trim() || undefined,
      price: newProduct.price !== '' ? Number(newProduct.price) : undefined,
      unit: newProduct.unit.trim() || undefined,
      active: newProduct.active,
    }
    await api.post(`/stores/${storeId.value}/products`, payload)
    newProduct.name = ''
    newProduct.description = ''
    newProduct.price = ''
    newProduct.unit = ''
    newProduct.active = true
    await loadProducts()
  } catch (e) {
    error.value = e?.message || 'افزودن محصول ناموفق بود'
  } finally {
    productAdding.value = false
  }
}

onMounted(() => {
  loadAll()
})
</script>

<style scoped>
.page {
  max-width: 560px;
  margin: 0 auto;
  padding: 16px 14px 40px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.title {
  margin: 0;
  font-size: 20px;
  font-weight: 900;
  color: var(--accent);
}

.sub {
  margin: 2px 0 0;
  font-size: 11.5px;
  color: var(--text-muted);
}

.icon-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--card);
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 19px;
}

.icon-btn.is-busy {
  opacity: 0.6;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.section-title {
  margin: 0 0 4px;
  font-size: 13.5px;
  font-weight: 800;
}

.tnum {
  font-variant-numeric: tabular-nums;
}

.pane {
  padding: 14px;
  border-radius: 14px;
  background: var(--card);
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.pay__label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
}

.pay__input {
  width: 100%;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 14px;
  outline: none;
}

.pay__input:focus {
  border-color: var(--accent);
}

.pay__textarea {
  width: 100%;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  outline: none;
  resize: vertical;
  font-family: inherit;
}

.pay__textarea:focus {
  border-color: var(--accent);
}

.msg {
  margin: 0;
  padding: 9px 11px;
  border-radius: 10px;
  font-size: 12.5px;
  font-weight: 600;
}

.msg--err {
  background: var(--down-soft);
  color: var(--down);
}

.msg--ok {
  background: var(--up-soft);
  color: var(--up);
}

.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
}

.btn .material-icons {
  font-size: 18px;
}

.btn--primary {
  padding: 12px 18px;
  border-radius: 12px;
  background: var(--accent);
  color: #fff;
  font-size: 14px;
  font-weight: 800;
}

.btn--primary:disabled {
  opacity: 0.5;
}

.btn--block {
  width: 100%;
}

/* ── Logo ── */
.logo-preview {
  display: flex;
  justify-content: center;
}

.logo-preview__img {
  width: 90px;
  height: 90px;
  border-radius: 12px;
  object-fit: cover;
  border: 1px solid var(--border);
}

.logo-upload {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  border: 1.5px dashed var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  color: var(--accent);
  font-size: 13.5px;
  font-weight: 800;
  cursor: pointer;
}

.logo-upload input {
  display: none;
}

.logo-upload.is-busy {
  opacity: 0.6;
  pointer-events: none;
}

.logo-upload .material-icons {
  font-size: 19px;
}

/* ── Products ── */
.products {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.product-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 13px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
}

.product-row__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.product-row__name {
  font-size: 13px;
  font-weight: 800;
}

.product-row__price {
  font-size: 12px;
  color: var(--accent);
  font-weight: 700;
}

.product-row__actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: transparent;
  border: none;
  color: var(--text-muted);
}

.toggle--on {
  color: var(--up);
}

.toggle:disabled,
.del:disabled {
  opacity: 0.5;
}

.del {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: transparent;
  border: none;
  color: var(--down);
}

.toggle .material-icons,
.del .material-icons {
  font-size: 22px;
}

/* ── Add form ── */
.add-form {
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px dashed var(--border);
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.add-form__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.add-form__cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
}

.check input {
  width: 18px;
  height: 18px;
  accent-color: var(--accent);
}

/* ── Empty ── */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 18px;
  border-radius: 14px;
  border: 1px dashed var(--border);
  text-align: center;
}

.empty--sm {
  padding: 18px;
}

.empty__icon {
  font-size: 34px;
  color: var(--text-muted);
}

.empty__text {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
}
</style>
