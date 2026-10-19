import axios from 'axios'

/**
 * API base for the NestJS delly-api.
 */
const baseURL = import.meta.env.VITE_API_URL || '/'

/** Public API origin (no trailing slash) — used to build uploaded-file URLs
 *  like store logos. */
export const apiBase = import.meta.env.VITE_API_URL || ''

export const api = axios.create({
  baseURL,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' }
})

const TOKEN_KEY = 'dg_trade_token'
const REFRESH_KEY = 'dg_refresh_token'

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch { /* storage unavailable */ }
}

export function getRefreshToken() {
  try { return localStorage.getItem(REFRESH_KEY) } catch { return null }
}

export function setRefreshToken(token) {
  try {
    if (token) localStorage.setItem(REFRESH_KEY, token)
    else localStorage.removeItem(REFRESH_KEY)
  } catch { /* storage unavailable */ }
}

// Attach the bearer token to every request.
api.interceptors.request.use(config => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Track if a refresh is already in flight so concurrent 401s don't each
// trigger their own refresh request.
let refreshPromise = null

/**
 * On 401: try to silently refresh the access token using the stored refresh
 * token. If the refresh succeeds, replay the original request. If it fails
 * (refresh token also expired/revoked), clear the session and reject so the
 * store's error handler can show the login sheet.
 */
api.interceptors.response.use(
  response => response.data?.data ?? response.data,
  async err => {
    const status = err?.response?.status
    const originalRequest = err?.config

    if (status === 401 && !originalRequest?._retried) {
      const refreshToken = getRefreshToken()

      if (refreshToken) {
        originalRequest._retried = true

        if (!refreshPromise) {
          refreshPromise = axios.post(`${baseURL}auth/refresh`, { refreshToken })
            .then(res => {
              const data = res.data?.data ?? res.data
              setToken(data.accessToken)
              if (data.refreshToken) setRefreshToken(data.refreshToken)
              return data.accessToken
            })
            .catch(refreshErr => {
              // Refresh token is dead — wipe everything and force re-login.
              setToken(null)
              setRefreshToken(null)
              throw refreshErr
            })
            .finally(() => { refreshPromise = null })
        }

        try {
          const newToken = await refreshPromise
          originalRequest.headers.Authorization = `Bearer ${newToken}`
          return api(originalRequest)
        } catch {
          // Refresh failed — fall through to the normal error path below.
        }
      }
    }

    const message =
      err?.response?.data?.error ||
      (err?.code === 'ECONNABORTED' ? 'پاسخی از سرور دریافت نشد (تایم‌اوت)' : null) ||
      err?.message ||
      'خطای نامشخص در ارتباط با سرور'
    const error = new Error(message)
    if (status === 401) error.isUnauthorized = true
    return Promise.reject(error)
  }
)
