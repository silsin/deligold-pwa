<template>
  <div class="page">
    <header class="head">
      <div>
        <h1 class="title">مشتریان</h1>
        <p class="sub">دعوت مشتری با لینک یا QR و مدیریت مشتریان کارگزاری</p>
      </div>
      <button type="button" class="icon-btn material-icons" :disabled="busy" title="بازآوری" @click="reload">refresh</button>
    </header>

    <div class="tabs" role="tablist">
      <button type="button" class="tab" :class="{ 'is-on': tab === 'invites' }" role="tab" @click="tab = 'invites'">
        دعوت مشتری<span v-if="validCount" class="count count--ok">{{ toFa(validCount) }}</span>
      </button>
      <button type="button" class="tab" :class="{ 'is-on': tab === 'customers' }" role="tab" @click="openCustomers">
        مشتریان
      </button>
    </div>

    <!-- ── Invites ── -->
    <template v-if="tab === 'invites'">
      <form class="card" @submit.prevent="create">
        <header class="card__head"><span><i class="material-icons">qr_code_2</i> تولید کد دعوت</span></header>
        <p class="note">
          مشتری با اسکن QR یا باز کردن لینک، مستقیم به فرم ثبت‌نام می‌رود و پس از ثبت‌نام به کارگزاری شما متصل می‌شود.
        </p>
        <div class="grid">
          <label class="field">
            <span>تاریخ انقضا (اختیاری)</span>
            <input v-model="form.expiresOn" class="field__input" type="date" :min="today" />
          </label>
          <label class="field">
            <span>حداکثر تعداد استفاده (اختیاری)</span>
            <input v-model.number="form.maxUses" class="field__input" type="number" min="1" inputmode="numeric" placeholder="نامحدود" />
          </label>
          <label v-if="auth.isSuperAdmin" class="field field--wide">
            <span>شناسه کارگزاری (فقط اگر چند کارگزاری دارید)</span>
            <input v-model.trim="form.brokerId" class="field__input" type="text" dir="ltr" placeholder="brokerId" />
          </label>
        </div>
        <p v-if="customers.invitesError" class="alert" role="alert">{{ customers.invitesError }}</p>
        <button type="submit" class="btn btn--primary" :disabled="busy">
          {{ customers.invitesLoading ? 'در حال ساخت…' : 'ساخت کد دعوت' }}
        </button>
      </form>

      <div v-if="customers.invitesLoading && !customers.invites.length" class="empty empty--inline">
        <p class="empty__text">در حال دریافت…</p>
      </div>
      <div v-else-if="!customers.invites.length" class="empty empty--inline">
        <p class="empty__text">هنوز کد دعوتی ساخته نشده است</p>
      </div>
      <ul v-else class="cards">
        <li v-for="inv in customers.invites" :key="inv.id" class="card" :class="{ 'is-dead': !inv.valid }">
          <div class="card__top">
            <div class="who">
              <b class="code" dir="ltr">{{ inv.code }}</b>
              <small>
                {{ inv.brokerName || '—' }}
                <template v-if="inv.createdByName"> · {{ inv.createdByName }}</template>
              </small>
            </div>
            <span class="badge" :class="badgeTone(inv)">{{ badgeLabel(inv) }}</span>
          </div>

          <div class="meta">
            <span><i class="material-icons">group_add</i> استفاده: {{ usageLabel(inv) }}</span>
            <span><i class="material-icons">event</i> انقضا: {{ inv.expiresAt ? faDate(inv.expiresAt) : 'ندارد' }}</span>
            <span><i class="material-icons">schedule</i> ساخت: {{ faDate(inv.createdAt) }}</span>
          </div>

          <template v-if="inv.valid">
            <div class="qr">
              <canvas :ref="el => drawQr(el, inv.code)" class="qr__canvas" :aria-label="`QR دعوت ${inv.code}`"></canvas>
            </div>
            <div class="link">
              <input class="field__input field__input--sm" :value="inviteUrl(inv.code)" readonly dir="ltr" @focus="$event.target.select()" />
            </div>
            <div class="actions">
              <button type="button" class="btn btn--primary btn--sm" @click="copy(inv.code)">
                <i class="material-icons">{{ copied === inv.code ? 'check' : 'content_copy' }}</i>
                {{ copied === inv.code ? 'کپی شد' : 'کپی لینک' }}
              </button>
              <button v-if="canShare" type="button" class="btn btn--sm" @click="share(inv.code)">
                <i class="material-icons">share</i> اشتراک
              </button>
              <button type="button" class="btn btn--sm" @click="download(inv.code)">
                <i class="material-icons">download</i> دانلود QR
              </button>
              <button type="button" class="btn btn--sm btn--danger" :disabled="busy" @click="setActive(inv, false)">
                غیرفعال‌سازی
              </button>
            </div>
          </template>
          <div v-else-if="!inv.active" class="actions">
            <button type="button" class="btn btn--sm" :disabled="busy" @click="setActive(inv, true)">فعال‌سازی دوباره</button>
          </div>
        </li>
      </ul>
    </template>

    <!-- ── Customers ── -->
    <template v-else>
      <p v-if="auth.error" class="alert" role="alert">{{ auth.error }}</p>

      <details class="card add">
        <summary class="card__head"><span><i class="material-icons">person_add</i> افزودن دستی مشتری</span></summary>
        <form class="grid" @submit.prevent="addCustomer">
          <label class="field">
            <span>شماره موبایل</span>
            <input v-model.trim="newCustomer.phone" class="field__input" type="text" inputmode="tel" dir="ltr" required />
          </label>
          <label class="field">
            <span>نام</span>
            <input v-model.trim="newCustomer.name" class="field__input" type="text" required />
          </label>
          <label class="field field--wide">
            <span>رمز عبور اولیه</span>
            <input v-model="newCustomer.password" class="field__input" type="text" minlength="6" dir="ltr" required />
          </label>
          <button type="submit" class="btn btn--primary field--wide" :disabled="busy">افزودن مشتری</button>
        </form>
      </details>

      <form class="filters" @submit.prevent="loadCustomers">
        <input v-model="search" class="field__input" type="search" placeholder="جست‌وجو: نام یا موبایل…" />
        <select v-model="verifiedFilter" class="field__input">
          <option value="">همه</option>
          <option value="pending">در انتظار تأیید</option>
          <option value="verified">تأییدشده</option>
        </select>
        <button type="submit" class="btn btn--primary" :disabled="busy">جست‌وجو</button>
      </form>

      <div v-if="auth.loading && !customerRows.length" class="empty empty--inline"><p class="empty__text">در حال دریافت…</p></div>
      <div v-else-if="!customerRows.length" class="empty empty--inline"><p class="empty__text">مشتری‌ای یافت نشد</p></div>
      <ul v-else class="cards">
        <li v-for="u in customerRows" :key="u.id" class="card">
          <div class="card__top">
            <div class="who"><b>{{ u.name || '—' }}</b><small class="tnum" dir="ltr">{{ u.phone || 'بدون موبایل' }}</small></div>
            <div class="badges">
              <span v-if="u.status === 'SUSPENDED'" class="badge is-bad">مسدود</span>
              <span class="badge" :class="u.verified ? 'is-ok' : 'is-warn'">{{ u.verified ? '✓ تأییدشده' : 'در انتظار' }}</span>
            </div>
          </div>
          <div class="actions">
            <button v-if="!u.verified" type="button" class="btn btn--primary btn--sm" :disabled="busy" @click="verify(u, true)">تأیید هویت</button>
            <button v-else type="button" class="btn btn--sm" :disabled="busy" @click="verify(u, false)">لغو تأیید</button>
            <button v-if="u.status !== 'SUSPENDED'" type="button" class="btn btn--sm btn--danger" :disabled="busy" @click="setStatus(u, 'SUSPENDED')">مسدود</button>
            <button v-else type="button" class="btn btn--sm" :disabled="busy" @click="setStatus(u, 'ACTIVE')">رفع مسدودی</button>
          </div>
        </li>
      </ul>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import QRCode from 'qrcode'
import { useAuthStore } from '../stores/auth'
import { useCustomersStore } from '../stores/customers'
import { ROLES } from '../utils/roles'
import { faJalaliDate, toFa } from '../utils/format'

const auth = useAuthStore()
const customers = useCustomersStore()

const tab = ref('invites')
const busy = computed(() => auth.loading || customers.invitesLoading)

// ── Invites ──────────────────────────────────────────────────────────────

const form = reactive({ expiresOn: '', maxUses: null, brokerId: '' })
const today = new Date().toISOString().slice(0, 10)
const copied = ref('')
const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

const validCount = computed(() => customers.invites.filter(i => i.valid).length)

/**
 * The link a customer opens. Built from the current origin (see design.md):
 * the manager is already on the host the invite should point at, and the
 * `?invite=` query sits before the hash so App.vue can read it.
 */
function inviteUrl(code) {
  return `${window.location.origin}/?invite=${encodeURIComponent(code)}`
}

// The API sends ISO strings; faJalaliDate parses numbers or Dates.
const faDate = iso => faJalaliDate(new Date(iso))

const isExpired = inv => !!inv.expiresAt && new Date(inv.expiresAt).getTime() < Date.now()
const isExhausted = inv => inv.maxUses != null && inv.uses >= inv.maxUses

function badgeLabel(inv) {
  if (inv.valid) return 'معتبر'
  if (!inv.active) return 'غیرفعال'
  if (isExpired(inv)) return 'منقضی'
  if (isExhausted(inv)) return 'تکمیل‌شده'
  return 'نامعتبر'
}

function badgeTone(inv) {
  if (inv.valid) return 'is-ok'
  return inv.active ? 'is-warn' : 'is-bad'
}

function usageLabel(inv) {
  return inv.maxUses == null ? `${toFa(inv.uses)} (نامحدود)` : `${toFa(inv.uses)} از ${toFa(inv.maxUses)}`
}

// Vue calls a function ref on every render; only draw a canvas once per code.
const drawn = new WeakMap()
function drawQr(el, code) {
  if (!el || drawn.get(el) === code) return
  drawn.set(el, code)
  QRCode.toCanvas(el, inviteUrl(code), { width: 220, margin: 2, errorCorrectionLevel: 'M' }).catch(() => {
    drawn.delete(el)
  })
}

async function create() {
  const dto = {}
  // A date input is a calendar day; the invite stays valid through its end.
  if (form.expiresOn) dto.expiresAt = new Date(`${form.expiresOn}T23:59:59`).toISOString()
  if (form.maxUses) dto.maxUses = Number(form.maxUses)
  if (auth.isSuperAdmin && form.brokerId) dto.brokerId = form.brokerId
  try {
    await customers.createInvite(dto)
    form.expiresOn = ''
    form.maxUses = null
  } catch {
    /* error shown from customers.invitesError */
  }
}

async function setActive(inv, active) {
  try {
    await customers.updateInvite(inv.id, { active })
  } catch {
    /* error shown from customers.invitesError */
  }
}

async function copy(code) {
  const url = inviteUrl(code)
  try {
    await navigator.clipboard.writeText(url)
  } catch {
    // Clipboard API needs a secure context; fall back to a hidden textarea.
    const ta = document.createElement('textarea')
    ta.value = url
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch { /* nothing else to try */ }
    ta.remove()
  }
  copied.value = code
  setTimeout(() => { if (copied.value === code) copied.value = '' }, 2000)
}

async function share(code) {
  try {
    await navigator.share({ title: 'دعوت به دلی گلد', text: 'برای ثبت‌نام در دلی گلد از این لینک استفاده کنید:', url: inviteUrl(code) })
  } catch {
    /* dismissed */
  }
}

async function download(code) {
  try {
    const dataUrl = await QRCode.toDataURL(inviteUrl(code), { width: 600, margin: 3, errorCorrectionLevel: 'M' })
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `invite-${code}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
  } catch {
    customers.invitesError = 'ساخت تصویر QR ناموفق بود'
  }
}

// ── Customers ────────────────────────────────────────────────────────────

const search = ref('')
const verifiedFilter = ref('')
const customersLoaded = ref(false)
const newCustomer = reactive({ phone: '', name: '', password: '' })

const customerRows = computed(() =>
  auth.directory.filter(u => (u?.role ?? ROLES.CUSTOMER) === ROLES.CUSTOMER)
)

async function loadCustomers() {
  const params = { search: search.value.trim(), limit: 100, role: ROLES.CUSTOMER }
  if (verifiedFilter.value === 'verified') params.verified = true
  if (verifiedFilter.value === 'pending') params.verified = false
  await auth.fetchDirectory(params)
  customersLoaded.value = true
}

function openCustomers() {
  tab.value = 'customers'
  if (!customersLoaded.value) loadCustomers()
}

async function addCustomer() {
  const { ok } = await auth.createStaffUser({ ...newCustomer, role: ROLES.CUSTOMER })
  if (ok) {
    newCustomer.phone = ''
    newCustomer.name = ''
    newCustomer.password = ''
  }
}

async function verify(u, ok) {
  const { ok: done } = await auth.setCustomerVerified(u.id, ok)
  if (done) await loadCustomers()
}

async function setStatus(u, status) {
  const { ok: done } = await auth.setCustomerStatus(u.id, status)
  if (done) await loadCustomers()
}

async function reload() {
  if (tab.value === 'invites') await customers.fetchInvites()
  else await loadCustomers()
}

onMounted(() => {
  customers.fetchInvites()
})
</script>

<style scoped>
.page { max-width: 720px; margin: 0 auto; padding: 16px 14px 30px; display: flex; flex-direction: column; gap: 12px; }
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.title { margin: 0; font-size: 19px; font-weight: 900; }
.sub { margin: 4px 0 0; font-size: 12px; color: var(--text-muted); }
.icon-btn { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 10px; background: var(--surface); border: 1px solid var(--border); color: var(--text-muted); }
.alert { margin: 0; padding: 10px 13px; border-radius: 12px; background: var(--down-soft); color: var(--down); font-size: 12.5px; }
.tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; border-radius: 12px; background: var(--surface); }
.tab { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 0; border-radius: 9px; font-size: 13.5px; font-weight: 800; color: var(--text-muted); }
.tab.is-on { background: var(--accent); color: #14100a; }
.count { min-width: 22px; padding: 1px 7px; border-radius: 999px; background: var(--down); color: #fff; font-size: 11px; font-weight: 900; }
.count--ok { background: var(--up); }
.tab.is-on .count { background: rgba(0, 0, 0, 0.25); }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--text-muted); }
.field--wide { grid-column: 1 / -1; }
.field__input { width: 100%; padding: 11px 13px; border-radius: 11px; border: 1px solid var(--border); background: var(--card); color: var(--text); font: inherit; font-size: 13.5px; }
.field__input--sm { padding: 9px 11px; font-size: 12px; }
.filters { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 5px; padding: 11px 18px; border-radius: 11px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 13.5px; font-weight: 800; white-space: nowrap; }
.btn .material-icons { font-size: 17px; }
.btn--primary { background: var(--accent); border-color: var(--accent); color: #14100a; }
.btn--sm { padding: 9px 14px; font-size: 12.5px; }
.btn--danger { color: var(--down); border-color: var(--down); }
.btn:disabled { opacity: 0.55; }
.cards { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.card { padding: 13px 14px; border-radius: 14px; background: var(--card); border: 1px solid var(--border); display: flex; flex-direction: column; gap: 10px; }
.card.is-dead { opacity: 0.7; }
.card__head { display: flex; align-items: center; justify-content: space-between; font-size: 13.5px; font-weight: 800; }
.card__head .material-icons { vertical-align: -5px; margin-left: 5px; font-size: 19px; color: var(--accent); }
.add summary { cursor: pointer; list-style: none; }
.add summary::-webkit-details-marker { display: none; }
.add[open] summary { margin-bottom: 4px; }
.card__top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.who { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.who b { font-size: 14px; }
.who small { font-size: 11.5px; color: var(--text-muted); }
.code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 17px !important; letter-spacing: 2px; text-align: right; }
.badges { display: flex; gap: 6px; }
.badge { padding: 3px 10px; border-radius: 999px; background: var(--surface); border: 1px solid var(--border); font-size: 11px; font-weight: 800; white-space: nowrap; }
.badge.is-ok { background: var(--up-soft); color: var(--up); border-color: var(--up); }
.badge.is-warn { background: color-mix(in srgb, var(--accent) 15%, var(--card)); color: var(--accent); border-color: var(--accent); }
.badge.is-bad { background: var(--down-soft); color: var(--down); border-color: var(--down); }
.meta { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 11.5px; color: var(--text-muted); }
.meta .material-icons { font-size: 15px; vertical-align: -3px; margin-left: 3px; }
.qr { display: flex; justify-content: center; }
.qr__canvas { width: 220px; height: 220px; border-radius: 12px; background: #fff; }
.note { margin: 0; font-size: 12px; color: var(--text-muted); line-height: 1.8; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.empty { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 32px 18px; border-radius: var(--radius); border: 1px dashed var(--border); text-align: center; }
.empty--inline { padding: 30px 0; }
.empty__text { margin: 0; font-size: 13px; color: var(--text-muted); }
@media (max-width: 560px) {
  .grid, .filters { grid-template-columns: 1fr; }
}
</style>
