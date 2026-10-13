<template>
  <div class="page denied">
    <span class="material-icons denied__icon">lock</span>
    <h1 class="denied__title">دسترسی ندارید</h1>
    <p class="denied__text">
      این بخش مخصوص همکاران است و با نقش شما قابل دسترسی نیست.
    </p>
    <p v-if="roleLabel" class="denied__role">نقش فعلی شما: <b>{{ roleLabel }}</b></p>
    <button type="button" class="btn btn--primary" @click="goHome">بازگشت</button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { ROLE_LABELS } from '../utils/roles'

const auth = useAuthStore()
const router = useRouter()

const roleLabel = computed(() => ROLE_LABELS[auth.role] ?? '')
function goHome() {
  router.push(auth.isStaff ? '/review' : '/')
}
</script>

<style scoped>
.denied {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 70vh;
  padding: 24px 20px;
  text-align: center;
}

.denied__icon {
  font-size: 56px;
  color: var(--down);
}

.denied__title {
  margin: 0;
  font-size: 20px;
  font-weight: 900;
}

.denied__text {
  margin: 0;
  max-width: 34ch;
  font-size: 13.5px;
  line-height: 1.9;
  color: var(--text-muted);
}

.denied__role {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-muted);
}

.btn--primary {
  margin-top: 6px;
  padding: 12px 22px;
  border-radius: 12px;
  background: var(--accent);
  color: #fff;
  font-size: 14px;
  font-weight: 800;
}
</style>
