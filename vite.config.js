import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// Where the dev server forwards the NestJS routes (delly-api). Override with
// DG_API_TARGET, e.g. http://host.docker.internal:7456 inside docker compose.
const DG_API_TARGET = process.env.DG_API_TARGET || 'http://127.0.0.1:7456'

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'دلی گلد — پلتفرم معاملاتی طلا',
        short_name: 'دلی گلد',
        description: 'معاملات آنلاین طلا و سکه با نمودار زنده و قیمت لحظه‌ای',
        lang: 'fa',
        dir: 'rtl',
        theme_color: '#0e0e0e',
        background_color: '#0e0e0e',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Market data must never be served stale from the cache.
        navigateFallbackDenylist: [/^\/(auth|users|trade|wallet|market|reports|stores|uploads)\//],
        runtimeCaching: [
          {
            urlPattern: /\/market\/board/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'trade-market',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 20, maxAgeSeconds: 300 }
            }
          }
        ]
      },
      devOptions: { enabled: false }
    })
  ],
  server: {
    port: 9741,
    host: '0.0.0.0',
    proxy: {
      // Dev only: forward every NestJS route to delly-api (default port 7456)
      // so the PWA stays same-origin and avoids CORS. Routes: /auth, /users,
      // /trade, /wallet, /market, /reports, /stores, /uploads. DG_API_TARGET
      // overrides the target (docker-compose dev passes host.docker.internal).
      '/auth': { target: DG_API_TARGET, changeOrigin: true },
      '/users': { target: DG_API_TARGET, changeOrigin: true },
      '/trade': { target: DG_API_TARGET, changeOrigin: true },
      '/wallet': { target: DG_API_TARGET, changeOrigin: true },
      '/market': { target: DG_API_TARGET, changeOrigin: true },
      '/reports': { target: DG_API_TARGET, changeOrigin: true },
      '/stores': { target: DG_API_TARGET, changeOrigin: true },
      '/uploads': { target: DG_API_TARGET, changeOrigin: true },
    }
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900 }
})

