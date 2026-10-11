import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

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
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: /\/api\/trade\/market/,
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
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      // Dev only: talk to the deli-gold Next.js app without CORS.
      '/api': {
        target: process.env.DG_API_TARGET || 'http://127.0.0.1:3000',
        changeOrigin: true
      }
    }
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900 }
})

