<template>
  <div class="page">

    <!-- ── Header ──────────────────────────────────────────────────────────── -->
    <header class="head">
      <div class="head__text">
        <h1 class="title">پیام‌ها</h1>
        <p class="sub">اعلان‌ها و پیام‌های سیستم</p>
      </div>
      <button
        type="button"
        class="icon-btn material-icons"
        :class="{ 'is-spinning': notifications.loading }"
        :disabled="notifications.loading"
        title="بازآوری"
        @click="notifications.fetch()"
      >refresh</button>
    </header>

    <!-- ── Not logged in ───────────────────────────────────────────────────── -->
    <div v-if="!auth.isLoggedIn" class="empty">
      <i class="material-icons empty__icon">manage_accounts</i>
      <p class="empty__text">برای مشاهده پیام‌ها، ابتدا وارد شوید</p>
    </div>

    <template v-else>
      <p v-if="notifications.error" class="alert" role="alert">
        <i class="material-icons">error_outline</i> {{ notifications.error }}
      </p>

      <!-- ── Broadcast panel (staff only) ─────────────────────────────────── -->
      <div
        v-if="auth.isBrokerAdmin || auth.isBrokerManager || auth.isSuperAdmin"
        class="broadcast-panel"
      >
        <button type="button" class="broadcast-toggle" @click="broadcastOpen = !broadcastOpen">
          <i class="material-icons">campaign</i>
          ارسال اطلاعیه
          <i class="material-icons broadcast-toggle__chevron">
            {{ broadcastOpen ? 'expand_less' : 'expand_more' }}
          </i>
        </button>
        <form v-if="broadcastOpen" class="broadcast-form" @submit.prevent="doBroadcast">
          <input
            v-model="bForm.title"
            class="field__input"
            type="text"
            placeholder="عنوان پیام"
            required
          />
          <textarea
            v-model="bForm.body"
            class="field__textarea"
            placeholder="متن پیام"
            rows="3"
            required
          ></textarea>
          <input
            v-model="bForm.url"
            class="field__input"
            type="text"
            placeholder="لینک (اختیاری)"
          />
          <select v-model="bForm.targetRole" class="field__select">
            <template v-if="auth.isSuperAdmin">
              <option value="">همه کاربران</option>
              <option value="CUSTOMER">مشتریان</option>
              <option value="BROKER_MANAGER">مدیران کارگزاری</option>
              <option value="BROKER_ADMIN">مدیران ارشد</option>
            </template>
            <template v-else-if="auth.isBrokerAdmin">
              <option value="">مشتریان و مدیران</option>
              <option value="CUSTOMER">فقط مشتریان</option>
              <option value="BROKER_MANAGER">فقط مدیران کارگزاری</option>
            </template>
            <template v-else>
              <option value="CUSTOMER">مشتریان</option>
            </template>
          </select>
          <div class="broadcast-form__footer">
            <p v-if="bResult" class="bresult" :class="bResult.ok ? 'bresult--ok' : 'bresult--err'">
              {{ bResult.ok ? 'اطلاعیه با موفقیت ارسال شد' : bResult.error }}
            </p>
            <button type="submit" class="btn btn--primary btn--sm" :disabled="notifications.loading">
              <i class="material-icons">send</i> ارسال اطلاعیه
            </button>
          </div>
        </form>
      </div>

      <!-- ── Mark-all-read button ──────────────────────────────────────────── -->
      <div
        v-if="notifications.items.length > 0 && notifications.unreadCount > 0"
        class="toolbar"
      >
        <button type="button" class="btn btn--sm" @click="notifications.markAllRead()">
          <i class="material-icons">done_all</i> خواندن همه
        </button>
      </div>

      <!-- ── Loading skeleton ──────────────────────────────────────────────── -->
      <div v-if="notifications.loading && !notifications.items.length" class="empty empty--inline">
        <i class="material-icons empty__icon spin">autorenew</i>
        <p class="empty__text">در حال دریافت…</p>
      </div>

      <!-- ── Empty state ───────────────────────────────────────────────────── -->
      <div v-else-if="!notifications.loading && !notifications.items.length" class="empty">
        <i class="material-icons empty__icon">inbox</i>
        <p class="empty__text">پیامی ندارید</p>
      </div>

      <!-- ── Notification list ─────────────────────────────────────────────── -->
      <ul v-else class="notif-list">
        <li
          v-for="n in notifications.items"
          :key="n.id"
          class="notif-item"
          :class="{ 'notif-item--unread': !n.read }"
          @click="onItemClick(n)"
        >
          <span class="dot" :class="{ 'dot--unread': !n.read }"></span>
          <div class="notif-content">
            <p class="notif-title" :class="{ 'notif-title--unread': !n.read }">{{ n.title }}</p>
            <p class="notif-body">{{ n.body }}</p>
            <p class="notif-time">{{ faAgo(n.createdAt) }}</p>
          </div>
        </li>
      </ul>
    </template>

  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useNotificationsStore } from '../stores/notifications.js'
import { useAuthStore } from '../stores/auth'
import { faAgo } from '../utils/format'

const auth = useAuthStore()
const notifications = useNotificationsStore()
const router = useRouter()

const broadcastOpen = ref(false)
const bResult = ref(null)
// A broker manager can only ever message customers — default to that tier so
// the form starts in a valid state even before the user touches the dropdown.
const bForm = reactive({
  title: '',
  body: '',
  url: '',
  targetRole: auth.isBrokerManager ? 'CUSTOMER' : '',
})

async function onItemClick(n) {
  if (!n.read) await notifications.markRead(n.id)
  if (n.url) router.push(n.url)
}

async function doBroadcast() {
  bResult.value = null
  const dto = {
    title: bForm.title,
    body: bForm.body,
    targetRole: bForm.targetRole || undefined,
    url: bForm.url || undefined,
  }
  const res = await notifications.broadcast(dto)
  bResult.value = res
  if (res.ok) {
    bForm.title = ''
    bForm.body = ''
    bForm.url = ''
    bForm.targetRole = ''
  }
}

onMounted(() => {
  if (auth.isLoggedIn) notifications.fetch()
})
</script>

<style scoped>
/* ── Page shell ──────────────────────────────────────────────────────────── */
.page {
  max-width: 720px;
  margin: 0 auto;
  padding: 16px 14px 40px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ── Header ──────────────────────────────────────────────────────────────── */
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.title { margin: 0; font-size: 20px; font-weight: 900; letter-spacing: -0.3px; }
.sub { margin: 4px 0 0; font-size: 12px; color: var(--text-muted); }
.icon-btn {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 11px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 20px;
}
.is-spinning { animation: spin 0.9s linear infinite; }

/* ── Alert ───────────────────────────────────────────────────────────────── */
.alert {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  padding: 11px 14px;
  border-radius: 12px;
  background: var(--down-soft);
  color: var(--down);
  font-size: 13px;
}
.alert .material-icons { font-size: 17px; flex-shrink: 0; }

/* ── Toolbar ─────────────────────────────────────────────────────────────── */
.toolbar {
  display: flex;
  justify-content: flex-start;
}

/* ── Empty states ────────────────────────────────────────────────────────── */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 38px 20px;
  border-radius: 16px;
  border: 1px dashed var(--border);
  text-align: center;
}
.empty--inline { padding: 28px 0; border: none; }
.empty__icon { font-size: 40px; color: var(--text-muted); opacity: 0.4; }
.empty__text { margin: 0; font-size: 13.5px; font-weight: 700; color: var(--text-muted); }

/* ── Notification list ───────────────────────────────────────────────────── */
.notif-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid var(--border);
}

.notif-item {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  background: var(--card);
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.15s;
}
.notif-item:last-child { border-bottom: none; }
.notif-item:hover { background: color-mix(in srgb, var(--accent) 4%, var(--card)); }
.notif-item--unread {
  background: color-mix(in srgb, var(--accent) 5%, var(--card));
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 6px;
  background: var(--border);
}
.dot--unread { background: var(--accent); }

.notif-content { flex: 1; min-width: 0; }
.notif-title { margin: 0; font-size: 14px; font-weight: 700; color: var(--text-muted); }
.notif-title--unread { font-weight: 900; color: var(--text); }
.notif-body { margin: 3px 0 0; font-size: 12.5px; color: var(--text-muted); line-height: 1.5; }
.notif-time { margin: 5px 0 0; font-size: 11px; color: var(--text-muted); }

/* ── Broadcast panel ─────────────────────────────────────────────────────── */
.broadcast-panel {
  border-radius: 14px;
  border: 1px solid var(--border);
  background: var(--card);
  overflow: hidden;
}

.broadcast-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 13px 16px;
  font-size: 14px;
  font-weight: 800;
  color: var(--text);
  text-align: right;
}
.broadcast-toggle .material-icons { font-size: 20px; color: var(--accent); }
.broadcast-toggle__chevron { margin-right: auto; font-size: 20px; color: var(--text-muted); }

.broadcast-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 16px 16px;
  border-top: 1px solid var(--border);
}

.broadcast-form__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.bresult { margin: 0; font-size: 13px; font-weight: 700; }
.bresult--ok { color: var(--up); }
.bresult--err { color: var(--down); }

/* ── Form fields ─────────────────────────────────────────────────────────── */
.field__input, .field__textarea, .field__select {
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  box-sizing: border-box;
}
.field__input:focus,
.field__textarea:focus,
.field__select:focus { outline: none; border-color: var(--accent); }
.field__textarea { resize: vertical; min-height: 72px; }

/* ── Buttons ─────────────────────────────────────────────────────────────── */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 10px 17px;
  border-radius: 11px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 13.5px;
  font-weight: 800;
  white-space: nowrap;
  cursor: pointer;
  transition: opacity 0.15s;
}
.btn .material-icons { font-size: 16px; }
.btn--sm { padding: 8px 13px; font-size: 12.5px; }
.btn--sm .material-icons { font-size: 15px; }
.btn--primary { background: var(--accent); border-color: var(--accent); color: #14100a; }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }

/* ── Helpers ─────────────────────────────────────────────────────────────── */
@keyframes spin { to { transform: rotate(360deg); } }
</style>
