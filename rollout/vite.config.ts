import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  // GITHUB_PAGES=true (set by the deploy workflow) builds with the repo
  // subpath base; local dev/preview stays at "/"
  base: process.env.GITHUB_PAGES ? "/peaks-OR-cheeks/" : "/",
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      workbox: {
        // both snapshots inline into one JS chunk (~2.1MB) — keep it precached
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // real-art lanes stream from EA/ESPN CDNs (nothing bundled): cache on
        // first sight so portraits go offline after one viewing; hand-dropped
        // mutart files are same-origin and cache the same way
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(ratings-images-prod\.pulse\.ea\.com|a\.espncdn\.com|drop-assets\.ea\.com)\//,
            handler: "CacheFirst",
            options: {
              cacheName: "card-art",
              expiration: { maxEntries: 900, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/mutart\/./,
            handler: "CacheFirst",
            options: {
              cacheName: "mutart",
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png', 'maskable-icon-512x512.png', 'icon.svg', 'mascots/*'],
      manifest: {
        name: 'Peaks or Cheeks',
        short_name: 'PeaksOrCheeks',
        description: 'One button. Two fates. Random pro football player pulls.',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0a0e1a',
        theme_color: '#0a0e1a',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: { alias: { "@": "/src" } },
  server: { fs: { allow: [".."] }, port: 5174 },
  preview: { port: 4174 },
  test: { environment: 'jsdom', setupFiles: ['./vitest.setup.ts'], globals: true,
          exclude: [...configDefaults.exclude],
          alias: { 'virtual:pwa-register': new URL('./src/test-pwa-stub.ts', import.meta.url).pathname } },
})
