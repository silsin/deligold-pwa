import axios from 'axios'

/**
 * API base for the deli-gold server.
 *
 * Production: the PWA is a different origin, so `VITE_API_URL` must point at the
 * Next.js app (and the server must list this origin in `TRADE_CORS_ORIGINS`).
 * Development: Vite proxies `/api` to the local Next app, so a relative base
 * avoids CORS entirely.
 */
const baseURL = import.meta.env.VITE_API_URL || '/'

export const api = axios.create({
  baseURL,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' }
})

const TOKEN_KEY = 'dg_trade_token'

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage unavailable — the session just won't survive a reload */
  }
}

// Attach the bearer token to every request (cookies cannot cross origins).
api.interceptors.request.use(config => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

/**
 * Our API answers `{ success, data }` / `{ success:false, error }`, so unwrap
 * here and always reject with a readable Persian message.
 */
api.interceptors.response.use(
  response => response.data?.data ?? response.data,
  err => {
    const message =
      err?.response?.data?.error ||
      (err?.code === 'ECONNABORTED' ? 'پاسخی از سرور دریافت نشد (تایم‌اوت)' : null) ||
      err?.message ||
      'خطای نامشخص در ارتباط با سرور'
    return Promise.reject(new Error(message))
  }
)
