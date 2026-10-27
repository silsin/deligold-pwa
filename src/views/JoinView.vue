<template>
  <div class="page">
    <header class="head">
      <h1 class="title">پیوستن به کارگزاری</h1>
      <p class="sub">کد QR دعوت کارگزاری را اسکن کنید یا کد دعوت را وارد کنید.</p>
    </header>

    <!-- Already attached / staff: nothing to scan. -->
    <div v-if="auth.isLoggedIn && auth.isStaff" class="card note-card">
      <span class="material-icons">badge</span>
      <p>حساب‌های کارمندی از طریق مدیر سیستم به کارگزاری متصل می‌شوند.</p>
    </div>
    <div v-else-if="auth.isLoggedIn && auth.user?.brokerId && !joined && !joining" class="card note-card is-ok">
      <span class="material-icons">verified</span>
      <p>حساب شما به یک کارگزاری متصل است. برای تغییر کارگزاری با پشتیبانی تماس بگیرید.</p>
    </div>

    <template v-else>
      <!-- ── Result of a scan / typed code ── -->
      <section v-if="joined" class="card result is-ok">
        <span class="material-icons result__icon">task_alt</span>
        <b>به {{ invite?.brokerName || 'کارگزاری' }} پیوستید</b>
        <p class="muted">از این پس معاملات و کیف پول شما زیر نظر این کارگزاری انجام می‌شود.</p>
        <button type="button" class="btn btn--primary" @click="router.push('/')">بازگشت به خانه</button>
      </section>

      <section v-else-if="invite" class="card result" :class="{ 'is-bad': !invite.valid }">
        <span class="material-icons result__icon">{{ invite.valid ? 'storefront' : 'link_off' }}</span>
        <template v-if="invite.valid">
          <span class="muted">دعوت‌نامه از</span>
          <b>{{ invite.brokerName }}</b>
          <template v-if="auth.isLoggedIn">
            <button type="button" class="btn btn--primary" :disabled="auth.loading" @click="join">
              {{ auth.loading ? 'در حال پیوستن…' : 'پیوستن به این کارگزاری' }}
            </button>
          </template>
          <template v-else>
            <button type="button" class="btn btn--primary" @click="registerWithInvite">ثبت‌نام با این دعوت‌نامه</button>
            <button type="button" class="btn" @click="loginThenJoin">حساب دارم — ورود و پیوستن</button>
          </template>
        </template>
        <b v-else>{{ invalidReason }}</b>
        <p v-if="auth.error" class="alert" role="alert">{{ auth.error }}</p>
        <button type="button" class="link" @click="reset">اسکن کد دیگر</button>
      </section>

      <!-- ── Scanner ── -->
      <template v-else>
        <section class="card scanner">
          <div class="viewport" :class="{ 'is-live': scanning }">
            <video ref="video" class="viewport__video" playsinline muted></video>
            <div v-if="scanning" class="viewport__frame" aria-hidden="true"></div>
            <div v-else class="viewport__idle">
              <span class="material-icons">qr_code_scanner</span>
            </div>
          </div>
          <p v-if="cameraError" class="alert" role="alert">{{ cameraError }}</p>
          <div class="actions">
            <button v-if="!scanning" type="button" class="btn btn--primary" @click="startCamera">
              <i class="material-icons">photo_camera</i> اسکن با دوربین
            </button>
            <button v-else type="button" class="btn" @click="stopCamera">
              <i class="material-icons">stop</i> توقف دوربین
            </button>
            <label class="btn">
              <i class="material-icons">image</i> انتخاب عکس QR
              <input type="file" accept="image/*" class="sr-only" @change="scanFile" />
            </label>
          </div>
        </section>

        <form class="card manual" @submit.prevent="checkCode(manualCode)">
          <label class="field">
            <span>یا کد دعوت را وارد کنید</span>
            <input
              v-model.trim="manualCode"
              class="field__input code-input"
              type="text"
              dir="ltr"
              autocapitalize="characters"
              autocomplete="off"
              maxlength="16"
              placeholder="ABCD2345"
            />
          </label>
          <p v-if="lookupError" class="alert" role="alert">{{ lookupError }}</p>
          <button type="submit" class="btn btn--primary" :disabled="checking || !manualCode">
            {{ checking ? 'در حال بررسی…' : 'بررسی کد' }}
          </button>
        </form>
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import jsQR from 'jsqr'
import { api } from '../utils/api'
import { useAuthStore } from '../stores/auth'
import { authGate, openLogin } from '../utils/authGate'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const video = ref(null)
const scanning = ref(false)
const cameraError = ref('')
const manualCode = ref('')
const checking = ref(false)
const lookupError = ref('')
const invite = ref(null)
const joined = ref(false)
/** True while the join call runs: the profile gains a broker before `joined` flips. */
const joining = ref(false)

let stream = null
let timer = null
const canvas = document.createElement('canvas')
const ctx = canvas.getContext('2d', { willReadFrequently: true })

const CODE_RE = /^[A-Z2-9]{4,16}$/i

/**
 * Pulls an invite code out of whatever a QR holds: the full invite link
 * (`https://…/?invite=CODE`, the form CustomersView renders) or a bare code.
 */
function extractCode(text) {
  const raw = String(text || '').trim()
  try {
    const fromUrl = new URL(raw).searchParams.get('invite')
    if (fromUrl) return fromUrl.toUpperCase()
  } catch {
    /* not a URL */
  }
  return CODE_RE.test(raw) ? raw.toUpperCase() : null
}

const invalidReason = computed(() => {
  const i = invite.value
  if (!i || i.valid) return ''
  if (!i.active) return 'این کد دعوت غیرفعال است'
  if (i.expired) return 'کد دعوت منقضی شده است'
  return 'ظرفیت این کد دعوت تکمیل شده است'
})

async function checkCode(text) {
  lookupError.value = ''
  auth.error = ''
  const code = extractCode(text)
  if (!code) {
    lookupError.value = 'این QR یا کد، دعوت‌نامه دلی گلد نیست'
    return
  }
  checking.value = true
  try {
    invite.value = await api.get(`/invites/${code}`)
    stopCamera()
  } catch (e) {
    lookupError.value = e.message || 'کد دعوت یافت نشد'
  } finally {
    checking.value = false
  }
}

// ── Camera ───────────────────────────────────────────────────────────────

/** Decode one RGBA frame; jsQR works everywhere (iOS Safari has no BarcodeDetector). */
function decode(source, width, height) {
  if (!width || !height) return null
  canvas.width = width
  canvas.height = height
  ctx.drawImage(source, 0, 0, width, height)
  const img = ctx.getImageData(0, 0, width, height)
  return jsQR(img.data, width, height, { inversionAttempts: 'attemptBoth' })?.data ?? null
}

async function startCamera() {
  cameraError.value = ''
  lookupError.value = ''
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraError.value = 'مرورگر شما دسترسی به دوربین را پشتیبانی نمی‌کند؛ از «انتخاب عکس QR» یا وارد کردن کد استفاده کنید.'
    return
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    })
    video.value.srcObject = stream
    await video.value.play()
    scanning.value = true
    tick()
  } catch (e) {
    stopCamera()
    cameraError.value =
      e?.name === 'NotAllowedError'
        ? 'اجازه دسترسی به دوربین داده نشد. از تنظیمات مرورگر اجازه دهید یا از «انتخاب عکس QR» استفاده کنید.'
        : 'دوربین در دسترس نیست؛ از «انتخاب عکس QR» یا وارد کردن کد استفاده کنید.'
  }
}

async function tick() {
  if (!scanning.value) return
  const v = video.value
  // Downscale large frames: decoding is far faster and a QR stays readable.
  const scale = v.videoWidth > 720 ? 720 / v.videoWidth : 1
  const text = decode(v, Math.round(v.videoWidth * scale), Math.round(v.videoHeight * scale))
  if (text) {
    if (navigator.vibrate) navigator.vibrate(60)
    await checkCode(text)
    // Found → checkCode stopped the camera. Otherwise (not ours, unknown
    // code) keep looking after a pause long enough to read the message.
    if (scanning.value) timer = setTimeout(tick, 1500)
    return
  }
  timer = setTimeout(tick, 180)
}

function stopCamera() {
  scanning.value = false
  clearTimeout(timer)
  stream?.getTracks().forEach(t => t.stop())
  stream = null
  if (video.value) video.value.srcObject = null
}

async function scanFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  cameraError.value = ''
  lookupError.value = ''
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height))
    const text = decode(bitmap, Math.round(bitmap.width * scale), Math.round(bitmap.height * scale))
    if (text) await checkCode(text)
    else lookupError.value = 'در این عکس کد QR پیدا نشد'
  } catch {
    lookupError.value = 'خواندن عکس ناموفق بود'
  }
}

// ── Actions ──────────────────────────────────────────────────────────────

async function join() {
  joining.value = true
  joined.value = await auth.joinBroker(invite.value.code)
  joining.value = false
}

/** Guest: hand the invite to the register sheet, exactly like opening the link. */
function registerWithInvite() {
  authGate.pendingInvite = { code: invite.value.code, brokerName: invite.value.brokerName, valid: true, reason: '' }
  openLogin('register')
}

/** Guest with an account: sign in, then come back here with the code kept. */
function loginThenJoin() {
  openLogin('login', `/join?code=${invite.value.code}`)
}

function reset() {
  invite.value = null
  joined.value = false
  manualCode.value = ''
  lookupError.value = ''
  auth.error = ''
}

function readQueryCode() {
  // 1. Check the route query (set when App.vue navigates a logged-in user to /join?code=)
  const fromQuery = route.query.code ? String(route.query.code) : ''
  if (fromQuery && fromQuery.toUpperCase() !== invite.value?.code) {
    checkCode(fromQuery)
    return
  }
  // 2. Check authGate.pendingInvite — set when App.vue resolved the invite
  //    for a guest but the user was actually logged in at activation time
  //    (race condition on first load before session restored).
  if (authGate.pendingInvite?.code && authGate.pendingInvite.code !== invite.value?.code) {
    const pending = authGate.pendingInvite
    if (pending.valid) {
      // Fast-path: we already have the broker name and validity — no need to
      // re-fetch; just show the confirm card directly.
      invite.value = { code: pending.code, brokerName: pending.brokerName, valid: true }
    } else {
      checkCode(pending.code)
    }
  }
}

onMounted(readQueryCode)
// Views sit in <KeepAlive>, so leaving the page deactivates rather than
// unmounts it — the camera must be released here or it keeps running.
onActivated(readQueryCode)
onDeactivated(stopCamera)
onBeforeUnmount(stopCamera)
</script>

<style scoped>
.page { max-width: 520px; margin: 0 auto; padding: 16px 16px 30px; display: flex; flex-direction: column; gap: 12px; }
.head .title { margin: 0; font-size: 19px; font-weight: 900; }
.head .sub { margin: 4px 0 0; font-size: 12.5px; color: var(--text-muted); line-height: 1.8; }
.card { padding: 14px; border-radius: 14px; background: var(--card); border: 1px solid var(--border); display: flex; flex-direction: column; gap: 12px; }
.note-card { flex-direction: row; align-items: center; gap: 10px; font-size: 13px; line-height: 1.8; }
.note-card p { margin: 0; }
.note-card .material-icons { color: var(--accent); }
.note-card.is-ok .material-icons { color: var(--up); }
.viewport { position: relative; aspect-ratio: 1; border-radius: 12px; overflow: hidden; background: var(--surface); border: 1px dashed var(--border); }
.viewport.is-live { background: #000; border-style: solid; }
.viewport__video { width: 100%; height: 100%; object-fit: cover; display: block; }
.viewport:not(.is-live) .viewport__video { display: none; }
.viewport__idle { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--text-muted); }
.viewport__idle .material-icons { font-size: 84px; opacity: 0.5; }
.viewport__frame { position: absolute; inset: 18%; border: 3px solid var(--accent); border-radius: 16px; box-shadow: 0 0 0 999px rgba(0, 0, 0, 0.35); }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.actions .btn { flex: 1 1 140px; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 12px 16px; border-radius: 11px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 13.5px; font-weight: 800; cursor: pointer; }
.btn .material-icons { font-size: 19px; }
.btn--primary { background: var(--accent); border-color: var(--accent); color: #14100a; }
.btn:disabled { opacity: 0.55; }
.field { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: var(--text-muted); }
.field__input { width: 100%; padding: 12px 13px; border-radius: 11px; border: 1px solid var(--border); background: var(--card); color: var(--text); font: inherit; font-size: 14px; }
.code-input { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: 3px; text-transform: uppercase; text-align: center; font-size: 17px; }
.alert { margin: 0; padding: 10px 13px; border-radius: 12px; background: var(--down-soft); color: var(--down); font-size: 12.5px; line-height: 1.8; }
.result { align-items: center; text-align: center; gap: 8px; padding: 22px 16px; }
.result b { font-size: 16px; }
.result .btn { width: 100%; }
.result__icon { font-size: 46px; color: var(--accent); }
.result.is-ok .result__icon { color: var(--up); }
.result.is-bad .result__icon { color: var(--down); }
.muted { margin: 0; color: var(--text-muted); font-size: 12.5px; line-height: 1.8; }
.link { background: none; border: 0; color: var(--text-muted); font-size: 12.5px; text-decoration: underline; padding: 6px; cursor: pointer; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
