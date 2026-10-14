<template>
  <div class="page">
    <header class="head">
      <div>
        <h1 class="title">حساب من</h1>
        <p class="sub">مشخصات، بدهی نسیه و تاریخچه حساب</p>
      </div>
      <button type="button" class="icon-btn material-icons" :class="{ 'is-busy': busy }" :disabled="busy" title="بازآوری" @click="refresh">refresh</button>
    </header>

    <div v-if="!auth.isLoggedIn" class="empty">
      <span class="material-icons empty__icon">lock</span>
      <p class="empty__text">برای مشاهده حساب و بدهی، وارد شوید</p>
      <button type="button" class="btn btn--primary" @click="openLogin('login')">
        <span class="material-icons">login</span> ورود به حساب
      </button>
    </div>

    <template v-else>
      <section class="profile">
        <div class="profile__avatar material-icons">account_circle</div>
        <div class="profile__who">
          <strong class="profile__name">{{ displayName }}</strong>
          <small class="profile__id">{{ displayId }}</small>
        </div>
        <span v-if="auth.isVerified" class="profile__live">تأیید شده</span>
        <span v-else class="profile__live is-unverified">تأیید نشده</span>
      </section>

      <p v-if="verifyNote" class="msg msg--err">{{ verifyNote }}</p>

      <section v-if="missingFields.length" class="pane pay">
        <h2 class="section-title">تکمیل پروفایل</h2>
        <ul class="entries">
          <li v-for="f in missingFields" :key="f" class="entry">
            <div class="entry__icon is-debit"><span class="material-icons">info</span></div>
            <div class="entry__body"><div class="entry__title">{{ missingLabel(f) }}</div></div>
          </li>
        </ul>
      </section>

      <section class="pane pay">
        <h2 class="section-title">ویرایش پروفایل</h2>
        <label class="pay__label" for="pf-name">نام</label>
        <input id="pf-name" v-model="form.name" type="text" class="pay__input tnum" />
        <label class="pay__label" for="pf-national">کد ملی</label>
        <input id="pf-national" v-model="form.nationalId" type="text" inputmode="numeric" class="pay__input tnum" />
        <label class="pay__label" for="pf-address">آدرس</label>
        <input id="pf-address" v-model="form.address" type="text" class="pay__input tnum" />
        <p v-if="saveError" class="msg msg--err">{{ saveError }}</p>
        <p v-if="saveOk" class="msg msg--ok">پروفایل با موفقیت ذخیره شد.</p>
        <button type="button" class="btn btn--primary btn--block" :disabled="saving" @click="submitProfile">
          <span class="material-icons">{{ saving ? 'autorenew' : 'save' }}</span>
          {{ saving ? 'در حال ذخیره…' : 'ذخیره پروفایل' }}
        </button>
      </section>

      <section class="debt" :class="{ 'is-clear': debt <= 0 }">
        <div class="debt__top">
          <span class="debt__label"><span class="material-icons">account_balance_wallet</span> بدهی شما (نسیه)</span>
          <span v-if="debt > 0" class="debt__pill">پرداخت‌نشده</span>
          <span v-else class="debt__pill is-ok">تسویه</span>
        </div>
        <div class="debt__value tnum">{{ faMoney(debt) }}</div>
        <p class="debt__hint">
          <span v-if="debt > 0">با ثبت پرداخت، مبلغ از بدهی شما کسر می‌شود.</span>
          <span v-else>حساب شما تسویه است؛ پرداخت جدید لازم نیست.</span>
        </p>
        <div class="stats">
          <div class="stat"><span class="stat__label">سفارش‌ها</span><strong class="stat__value tnum">{{ toFa(orderCount) }}</strong></div>
          <div class="stat"><span class="stat__label">جمع خرید نسیه</span><strong class="stat__value tnum">{{ faCompact(totalDebit) }}</strong></div>
          <div class="stat"><span class="stat__label">جمع پرداخت</span><strong class="stat__value tnum">{{ faCompact(totalPaid) }}</strong></div>
        </div>
      </section>

      <section v-if="debt > 0" class="pane pay">
        <h2 class="section-title">ثبت پرداخت</h2>
        <label class="pay__label" for="pay-amount">مبلغ (تومان)</label>
        <input id="pay-amount" v-model="payText" type="text" inputmode="numeric" class="pay__input tnum" placeholder="۰" :disabled="paying" @input="onPayInput" />
        <div class="pay__quick">
          <button v-for="amt in quickAmounts" :key="amt" type="button" class="chip" @click="payAmount = Math.min(amt, debt)">{{ faCompact(amt) }}</button>
          <button type="button" class="chip chip--full" @click="payAmount = debt">کل بدهی</button>
        </div>
        <p class="pay__preview">مبلغ پرداختی: <strong class="tnum">{{ faMoney(payAmount) }}</strong><span v-if="payAmount > 0" class="pay__remain"> · مانده پس از پرداخت: {{ faMoney(debt - payAmount) }}</span></p>
        <p v-if="payError" class="msg msg--err">{{ payError }}</p>
        <p v-if="payOk" class="msg msg--ok">پرداخت با موفقیت ثبت شد.</p>
        <button type="button" class="btn btn--primary btn--block" :disabled="!canPay || paying" @click="submitPay">
          <span class="material-icons">{{ paying ? 'autorenew' : 'payments' }}</span>
          {{ paying ? 'در حال ثبت…' : 'ثبت پرداخت' }}
        </button>
      </section>

      <section class="ledger">
        <div class="ledger__head">
          <h2 class="section-title">تاریخچه حساب</h2>
          <div class="filters" role="tablist">
            <button v-for="f in filters" :key="f.value" type="button" role="tab" class="chip" :class="{ 'chip--on': active === f.value }" :aria-selected="active === f.value" @click="active = f.value">{{ f.label }}</button>
          </div>
        </div>
        <div v-if="busy && !entries.length" class="empty">
          <span class="material-icons empty__icon spin">autorenew</span>
          <p class="empty__text">در حال دریافت تاریخچه…</p>
        </div>
        <div v-else-if="!visible.length" class="empty">
          <span class="material-icons empty__icon">receipt_long</span>
          <p class="empty__text">{{ entries.length ? 'موردی در این دسته نیست.' : 'هنوز تراکنشی ثبت نشده است.' }}</p>
        </div>
        <ul v-else class="entries">
          <li v-for="e in visible" :key="e.id" class="entry">
            <div class="entry__icon" :class="entryClass(e)"><span class="material-icons">{{ entryIcon(e) }}</span></div>
            <div class="entry__body">
              <div class="entry__title">{{ kindLabel(e) }}</div>
              <div class="entry__meta"><span v-if="e.createdAt">{{ faAgo(e.createdAt) }}</span><span v-if="e.orderId" class="entry__ref">سفارش {{ String(e.orderId).slice(-6) }}</span></div>
            </div>
            <div class="entry__amount tnum" :class="entryClass(e)">{{ entrySign(e) }}{{ faMoney(e.amount) }}</div>
          </li>
        </ul>
      </section>

      <button type="button" class="logout" @click="logout"><span class="material-icons">logout</span> خروج از حساب</button>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { faAgo, faCompact, faMoney, toFa } from '../utils/format'

const router = useRouter()
const auth = useAuthStore()

const busy = ref(false)
const paying = ref(false)
const payError = ref('')
const payOk = ref(false)
const payAmount = ref(0)
const payText = ref('')
const active = ref('ALL')
const saving = ref(false)
const saveError = ref('')
const saveOk = ref(false)
const form = reactive({ name: '', nationalId: '', address: '' })

watch(() => auth.user, (u) => {
  if (!u) return
  form.name = u.name ?? ''
  form.nationalId = u.nationalId ?? ''
  form.address = u.address ?? ''
}, { immediate: true })

const profileCheck = computed(() => auth.profileCheck ?? {})
const missingFields = computed(() => {
  const m = profileCheck.value.missing
  if (Array.isArray(m) && m.length) return m
  const out = []
  if (!auth.user?.name) out.push('name')
  if (!auth.user?.nationalId) out.push('nationalId')
  if (!auth.user?.address) out.push('address')
  return out
})
const verifyNote = computed(() => {
  if (auth.isVerified) return ''
  return profileCheck.value.note || profileCheck.value.message || 'حساب شما هنوز تأیید نشده است.'
})
function missingLabel(f) {
  if (f === 'name') return 'نام'
  if (f === 'nationalId') return 'کد ملی'
  if (f === 'address') return 'آدرس'
  return f
}
async function submitProfile() {
  saving.value = true
  saveError.value = ''
  saveOk.value = false
  const res = await auth.updateProfile({ name: form.name, nationalId: form.nationalId, address: form.address })
  saving.value = false
  if (res?.ok) saveOk.value = true
  else saveError.value = res?.error || auth.error || 'به‌روزرسانی پروفایل ناموفق بود'
}

const filters = [
  { value: 'ALL', label: 'همه' },
  { value: 'DEBIT', label: 'بدهی' },
  { value: 'PAY', label: 'پرداخت' }
]

const entries = computed(() => auth.transactions ?? [])
const debt = computed(() => 0)
const orderCount = computed(() => auth.orders?.length ?? 0)

function isPayment(e) { return String(e?.kind ?? '').toUpperCase().includes('PAY') }

const totalPaid = computed(() => entries.value.filter(isPayment).reduce((s, e) => s + (Number(e.amount) || 0), 0))
const totalDebit = computed(() => entries.value.filter(e => !isPayment(e)).reduce((s, e) => s + (Number(e.amount) || 0), 0))
const visible = computed(() => {
  if (active.value === 'PAY') return entries.value.filter(isPayment)
  if (active.value === 'DEBIT') return entries.value.filter(e => !isPayment(e))
  return entries.value
})
const quickAmounts = computed(() => {
  const d = debt.value
  if (!d) return []
  return [1000000, 5000000, 10000000].filter(v => v < d)
})
const displayName = computed(() => auth.user?.name || auth.user?.email || auth.user?.phone || 'کاربر دلی گلد')
const displayId = computed(() => auth.user?.email || auth.user?.phone || 'حساب فعال')
const canPay = computed(() => {
  const v = Number(payAmount.value)
  return Number.isFinite(v) && v > 0 && v <= debt.value && !paying.value
})

function faDigits(s) {
  return String(s ?? '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
}
function onPayInput(ev) {
  const digits = faDigits(ev.target.value).replace(/[^0-9]/g, '').slice(0, 12)
  payAmount.value = digits ? Number(digits) : 0
  payText.value = payAmount.value ? Number(payAmount.value).toLocaleString('en-US') : ''
  payOk.value = false
  payError.value = ''
}
async function submitPay() {
  if (!canPay.value) return
  paying.value = true
  payError.value = ''
  payOk.value = false
  const res = await auth.requestWithdrawal(Number(payAmount.value), 'برداشت وجه', 'پرداخت بدهی از حساب')
  paying.value = false
  if (res?.ok) {
    payOk.value = true
    payAmount.value = 0
    payText.value = ''
    await refresh(false)
  } else {
    payError.value = res?.error || auth.error || 'ثبت پرداخت ناموفق بود'
  }
}
function entryClass(e) { return isPayment(e) ? 'is-pay' : 'is-debit' }
function entryIcon(e) { return isPayment(e) ? 'south_west' : 'north_east' }
function entrySign(e) { return isPayment(e) ? '−' : '+' }
function kindLabel(e) {
  const k = String(e?.kind ?? '').toUpperCase()
  if (k.includes('PAY')) return 'پرداخت'
  if (k.includes('ORDER')) return 'بدهی سفارش'
  if (k.includes('CANCEL')) return 'بازگشت وجه (لغو سفارش)'
  if (k.includes('ADJUST')) return 'اصلاح دستی'
  return e?.kind ?? 'تراکنش'
}
async function refresh(withSpinner = true) {
  if (!auth.isLoggedIn) return
  if (withSpinner) busy.value = true
  try { await Promise.all([auth.fetchProfile(), auth.fetchWallet(), auth.fetchOrders()]) }
  finally { if (withSpinner) busy.value = false }
}
function logout() { auth.logout(); router.push('/') }
onMounted(() => { refresh() })
</script>

<style scoped>
.page { max-width: 560px; margin: 0 auto; padding: 16px 14px 30px; display: flex; flex-direction: column; gap: 12px; }
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.title { margin: 0; font-size: 20px; font-weight: 900; color: var(--accent); }
.sub { margin: 2px 0 0; font-size: 11.5px; color: var(--text-muted); }
.icon-btn { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 10px; background: var(--card); border: 1px solid var(--border); color: var(--text-muted); font-size: 19px; }
.icon-btn.is-busy { opacity: 0.6; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.section-title { margin: 0; font-size: 13.5px; font-weight: 800; }
.tnum { font-variant-numeric: tabular-nums; }
.profile { display: flex; align-items: center; gap: 11px; padding: 13px 14px; border-radius: var(--radius); background: var(--card); border: 1px solid var(--border); }
.profile__avatar { font-size: 42px; color: var(--text-muted); line-height: 1; }
.profile__who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.profile__name { font-size: 14px; font-weight: 800; }
.profile__id { font-size: 11px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: ltr; }
.profile__live { padding: 3px 10px; border-radius: 999px; background: var(--up-soft); color: var(--up); font-size: 11px; font-weight: 800; }
.debt { padding: 16px 15px; border-radius: var(--radius); border: 1px solid var(--border); background: linear-gradient(135deg, color-mix(in srgb, var(--down) 14%, var(--card)), var(--card) 65%); }
.debt.is-clear { background: linear-gradient(135deg, color-mix(in srgb, var(--up) 13%, var(--card)), var(--card) 65%); }
.debt__top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.debt__label { display: flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 700; color: var(--text-muted); }
.debt__label .material-icons { font-size: 18px; }
.debt__pill { padding: 3px 10px; border-radius: 999px; background: var(--down-soft); color: var(--down); font-size: 10.5px; font-weight: 800; }
.debt__pill.is-ok { background: var(--up-soft); color: var(--up); }
.debt__value { margin-top: 6px; font-size: 27px; font-weight: 900; line-height: 1.3; }
.debt__hint { margin: 4px 0 0; font-size: 11.5px; color: var(--text-muted); }
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
.stat { display: flex; flex-direction: column; gap: 2px; padding: 9px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border); }
.stat__label { font-size: 10px; color: var(--text-muted); }
.stat__value { font-size: 12.5px; font-weight: 800; }
.pane { padding: 14px; border-radius: var(--radius); background: var(--card); border: 1px solid var(--border); display: flex; flex-direction: column; gap: 9px; }
.pay__label { font-size: 12px; font-weight: 700; color: var(--text-muted); }
.pay__input { width: 100%; padding: 13px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 20px; font-weight: 800; text-align: center; outline: none; }
.pay__input:focus { border-color: var(--accent); }
.pay__quick { display: flex; gap: 6px; flex-wrap: wrap; }
.chip { flex: 1 1 auto; padding: 8px 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); color: var(--text-muted); font-size: 12px; font-weight: 700; white-space: nowrap; }
.chip--full { border-color: var(--accent); color: var(--accent); }
.chip--on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 15%, transparent); color: var(--accent); }
.pay__preview { margin: 0; font-size: 12px; color: var(--text-muted); }
.pay__remain { color: var(--up); }
.msg { margin: 0; padding: 9px 11px; border-radius: var(--radius-sm); font-size: 12.5px; font-weight: 600; }
.msg--err { background: var(--down-soft); color: var(--down); }
.msg--ok { background: var(--up-soft); color: var(--up); }
.btn { display: flex; align-items: center; justify-content: center; gap: 7px; }
.btn .material-icons { font-size: 18px; }
.btn--primary { padding: 13px 18px; border-radius: 12px; background: var(--accent); color: #fff; font-size: 14.5px; font-weight: 800; }
.btn--primary:disabled { opacity: 0.5; }
.btn--block { width: 100%; }
.ledger { display: flex; flex-direction: column; gap: 10px; }
.ledger__head { display: flex; flex-direction: column; gap: 9px; }
.filters { display: flex; gap: 6px; }
.entries { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.entry { display: flex; align-items: center; gap: 11px; padding: 12px 13px; border-radius: var(--radius); background: var(--card); border: 1px solid var(--border); }
.entry__icon { width: 38px; height: 38px; flex: 0 0 auto; display: flex; align-items: center; justify-content: center; border-radius: 12px; }
.entry__icon .material-icons { font-size: 19px; }
.entry__icon.is-pay { background: var(--up-soft); color: var(--up); }
.entry__icon.is-debit { background: var(--down-soft); color: var(--down); }
.entry__body { flex: 1; min-width: 0; }
.entry__title { font-size: 13px; font-weight: 800; }
.entry__meta { display: flex; gap: 8px; font-size: 11px; color: var(--text-muted); }
.entry__ref { direction: ltr; }
.entry__amount { font-size: 12.5px; font-weight: 800; white-space: nowrap; }
.entry__amount.is-pay { color: var(--up); }
.entry__amount.is-debit { color: var(--down); }
.empty { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 32px 18px; border-radius: var(--radius); border: 1px dashed var(--border); text-align: center; }
.empty__icon { font-size: 34px; color: var(--text-muted); }
.empty__text { margin: 0; font-size: 13px; color: var(--text-muted); }
.logout { display: flex; align-items: center; justify-content: center; gap: 7px; width: 100%; padding: 12px 0; border-radius: 12px; border: 1px solid var(--down); color: var(--down); font-size: 14px; font-weight: 800; }
.logout .material-icons { font-size: 18px; }
.stat__label { font-size: 10px; color: var(--text-muted); }
.stat__value { font-size: 12.5px; font-weight: 800; }
</style>

