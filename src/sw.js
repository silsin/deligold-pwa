// دلی گلد — custom service worker (injectManifest strategy)
// vite-plugin-pwa injects self.__WB_MANIFEST at build time.

import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

// ── Precache ──────────────────────────────────────────────────────────────
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// ── Lifecycle ─────────────────────────────────────────────────────────────
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

// ── Navigation fallback ───────────────────────────────────────────────────
// API routes must never be intercepted by the SPA fallback.
const DENY = /^\/(auth|users|invites|trade|wallet|market|reports|stores|uploads|push)\//
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('./index.html'), { denylist: [DENY] }),
)

// ── Runtime caching ───────────────────────────────────────────────────────
// Market data: NetworkFirst so stale prices are never served.
registerRoute(
  ({ url }) => url.pathname.includes('/market/board'),
  new NetworkFirst({
    cacheName: 'trade-market',
    networkTimeoutSeconds: 8,
    plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 300 })],
  }),
)

// ── Push notifications ────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload
  try {
    payload = event.data.json()
  } catch {
    return
  }
  const { title = 'دلی گلد', body = '', icon = '/icons/icon-192x192.png', tag, data } = payload
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: '/icons/icon-192x192.png',
      tag: tag ?? 'delly-push',
      data: data ?? {},
      dir: 'rtl',
      lang: 'fa',
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          // Tell the app to navigate to the right page
          client.postMessage({ type: 'navigate', url })
          return
        }
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
