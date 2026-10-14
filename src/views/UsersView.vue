<template>
  <div class="page">
    <header class="head">
      <div>
        <h1 class="title">کاربران</h1>
        <p class="sub">جست‌وجو، اعطای نقش و ساخت حساب همکار (ویژه مدیر سیستم)</p>
      </div>
      <button type="button" class="icon-btn material-icons" :disabled="auth.loading" title="بازآوری" @click="load">refresh</button>
    </header>
    <div v-if="!auth.isLoggedIn" class="empty">
      <p class="empty__text">برای مدیریت کاربران، ابتدا وارد شوید</p>
      <button type="button" class="btn btn--primary" @click="openLogin('login')">ورود</button>
    </div>
    <template v-else>
      <p v-if="auth.error" class="alert" role="alert">{{ auth.error }}</p>
      <form class="filters" @submit.prevent="load">
        <input v-model="search" class="field__input" type="search" placeholder="جست‌وجو: نام یا موبایل…" />
        <select v-model="roleFilter" class="field__input">
          <option value="">همه نقش‌ها</option>
          <option v-for="r in ALLOWED_ROLES" :key="r" :value="r">{{ ROLE_LABELS[r] }} ({{ r }})</option>
        </select>
        <button type="submit" class="btn btn--primary" :disabled="auth.loading">جست‌وجو</button>
      </form>
      <details v-if="canCreate" class="card create">
        <summary class="card__head card__head--click">
          <span><i class="material-icons">person_add</i> ساخت حساب همکار</span>
        </summary>
        <form class="create__form" @submit.prevent="create">
          <label class="field"><span>شماره موبایل</span>
            <input v-model="form.phone" class="field__input" type="text" inputmode="tel" placeholder="0912…" required />
          </label>
          <label class="field"><span>نام</span>
            <input v-model="form.name" class="field__input" type="text" placeholder="نام و نام خانوادگی" required />
          </label>
          <label class="field"><span>رمز عبور (اختیاری)</span>
            <input v-model="form.password" class="field__input" type="text" autocomplete="new-password" placeholder="حداقل 6 کاراکتر" />
          </label>
          <label class="field"><span>نقش</span>
            <select v-model="form.role" class="field__input">
              <option v-for="r in ALLOWED_ROLES" :key="r" :value="r">{{ ROLE_LABELS[r] }} ({{ r }})</option>
            </select>
          </label>
          <p v-if="createMsg" class="note" :class="createOk ? 'is-ok' : 'is-err'">{{ createMsg }}</p>
          <button type="submit" class="btn btn--primary" :disabled="auth.loading || !form.phone.trim() || !form.name.trim()">
            {{ auth.loading ? 'در حال ساخت…' : 'ساخت حساب' }}
          </button>
        </form>
        <p class="hint">نقش SUPER_ADMIN فقط از همین فرم (توسط مدیر سیستم) ساخته می‌شود.</p>
      </details>
      <div v-if="auth.loading && !auth.directory.length" class="empty empty--inline"><p class="empty__text">در حال دریافت…</p></div>
      <div v-else-if="!auth.directory.length" class="empty empty--inline"><p class="empty__text">کاربری یافت نشد</p></div>
      <ul v-else class="users">
        <li v-for="u in auth.directory" :key="u.id" class="card user">
          <div class="user__top">
            <div class="user__who"><b>{{ u.name || '—' }}</b><small class="tnum" dir="ltr">{{ u.phone || 'بدون موبایل' }}</small></div>
            <span class="badge" :class="roleClass(u.role)">{{ ROLE_LABELS[u.role] ?? u.role }}</span>
          </div>
          <div class="user__meta">
            <span v-if="u.verified" class="ok">✓ تأییدشده</span><span v-else class="muted">تأییدنشده</span>
            <span class="muted tnum">id: {{ shortId(u.id) }}</span>
          </div>
          <div v-if="canGrant(u)" class="grant">
            <select v-model="grants[u.id]" class="field__input field__input--sm">
              <option v-for="r in grantableRoles(u)" :key="r" :value="r">{{ ROLE_LABELS[r] }} ({{ r }})</option>
            </select>
            <input v-model="notes[u.id]" class="field__input field__input--sm" type="text" maxlength="300" placeholder="دلیل (اختیاری)" />
            <button type="button" class="btn btn--primary btn--sm" :disabled="auth.loading || !grants[u.id] || grants[u.id] === u.role" @click="grant(u)">ثبت نقش</button>
          </div>
          <p v-else class="hint">تغییر نقش این کاربر مجاز نیست (هم‌سطح/بالاتر یا خودتان).</p>
        </li>
      </ul>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useAuthStore } from '../stores/auth'
import { ROLES, ROLE_LABELS, ROLE_RANK } from '../utils/roles'

const auth = useAuthStore()
const search = ref('')
const roleFilter = ref('')
const grants = reactive({})
const notes = reactive({})
const form = reactive({ phone: '', name: '', password: '', role: ROLES.BROKER_MANAGER })
const createMsg = ref('')
const createOk = ref(false)

const ALLOWED_ROLES = computed(() => {
  const mine = ROLE_RANK[auth.role] ?? 0
  return Object.values(ROLES).filter(r => (ROLE_RANK[r] ?? 0) < mine)
})
const canCreate = computed(() => ALLOWED_ROLES.value.length > 0)
function roleClass(role) {
  if (role === ROLES.SUPER_ADMIN) return 'is-admin'
  if (role === ROLES.BROKER_ADMIN || role === ROLES.BROKER_MANAGER) return 'is-staff'
  return ''
}
const shortId = id => String(id ?? '').slice(0, 8)
function grantableRoles(u) {
  const mine = ROLE_RANK[auth.role] ?? 0
  return Object.values(ROLES).filter(r => (ROLE_RANK[r] ?? 0) < mine)
}
function canGrant(u) {
  if (!u?.id || u.id === auth.user?.id) return false
  const mine = ROLE_RANK[auth.role] ?? 0
  const theirs = ROLE_RANK[u.role] ?? 0
  return mine > theirs && grantableRoles(u).length > 0
}
async function load() {
  await auth.fetchDirectory({ search: search.value.trim(), role: roleFilter.value || undefined, limit: 100 })
  for (const u of auth.directory) {
    if (!grants[u.id]) grants[u.id] = grantableRoles(u)[0] ?? u.role
  }
}
async function grant(u) {
  const { ok } = await auth.changeUserRole(u.id, grants[u.id], notes[u.id] || '')
  if (ok) { notes[u.id] = ''; await load() }
}
async function create() {
  createMsg.value = ''; createOk.value = false
  const { ok, error } = await auth.createStaffUser({
    phone: form.phone.trim(), name: form.name.trim(),
    password: form.password || undefined, role: form.role,
  })
  createOk.value = ok
  createMsg.value = ok ? 'حساب ساخته شد.' : (error || auth.error || 'ساخت حساب ناموفق بود')
  if (ok) { form.phone = ''; form.name = ''; form.password = ''; await load() }
}
watch(() => auth.role, () => {
  if (!ALLOWED_ROLES.value.includes(form.role)) form.role = ALLOWED_ROLES.value[0] ?? ROLES.CUSTOMER
})
onMounted(() => { if (auth.isLoggedIn) load() })
</script>

<style scoped>
.page { max-width: 720px; margin: 0 auto; padding: 16px 14px 30px; display: flex; flex-direction: column; gap: 12px; }
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.title { margin: 0; font-size: 19px; font-weight: 900; }
.sub { margin: 4px 0 0; font-size: 12px; color: var(--text-muted); }
.icon-btn { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 10px; background: var(--surface); border: 1px solid var(--border); color: var(--text-muted); }
.alert { margin: 0; padding: 10px 13px; border-radius: 12px; background: var(--down-soft); color: var(--down); font-size: 12.5px; }
.filters { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; }
.field__input { width: 100%; padding: 11px 13px; border-radius: 11px; border: 1px solid var(--border); background: var(--card); color: var(--text); font: inherit; font-size: 13.5px; }
.field__input--sm { padding: 9px 11px; font-size: 12.5px; }
.field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; font-weight: 700; color: var(--text-muted); }
.btn { padding: 11px 18px; border-radius: 11px; border: 1px solid var(--border); background: var(--surface); font-size: 13.5px; font-weight: 800; white-space: nowrap; }
.btn--primary { background: var(--accent); border-color: var(--accent); color: #14100a; }
.btn--sm { padding: 9px 14px; font-size: 12.5px; }
.btn:disabled { opacity: 0.55; }
.card { padding: 13px 14px; border-radius: 14px; background: var(--card); border: 1px solid var(--border); }
.card__head { display: flex; align-items: center; justify-content: space-between; font-size: 13.5px; font-weight: 800; }
.card__head--click { cursor: pointer; list-style: none; }
.card__head .material-icons { vertical-align: -5px; margin-left: 5px; font-size: 19px; color: var(--accent); }
.create__form { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
.hint { margin: 10px 0 0; font-size: 11px; line-height: 1.8; color: var(--text-muted); }
.note { margin: 0; font-size: 12.5px; font-weight: 700; }
.note.is-ok { color: var(--up); }
.note.is-err { color: var(--down); }
.users { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.user__top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.user__who { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.user__who b { font-size: 14px; }
.user__who small { font-size: 11.5px; color: var(--text-muted); }
.user__meta { display: flex; align-items: center; gap: 10px; margin-top: 8px; font-size: 11px; }
.ok { color: var(--up); font-weight: 800; }
.muted { color: var(--text-muted); }
.badge { padding: 3px 10px; border-radius: 999px; background: var(--surface); border: 1px solid var(--border); font-size: 11px; font-weight: 800; white-space: nowrap; }
.badge.is-staff { background: color-mix(in srgb, var(--accent) 15%, var(--card)); color: var(--accent); border-color: var(--accent); }
.badge.is-admin { background: var(--down-soft); color: var(--down); border-color: var(--down); }
.grant { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; margin-top: 12px; }
.empty { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 32px 18px; border-radius: var(--radius); border: 1px dashed var(--border); text-align: center; }
.empty--inline { padding: 30px 0; }
.empty__text { margin: 0; font-size: 13px; color: var(--text-muted); }
@media (max-width: 560px) {
  .filters { grid-template-columns: 1fr; }
  .grant { grid-template-columns: 1fr; }
}
</style>