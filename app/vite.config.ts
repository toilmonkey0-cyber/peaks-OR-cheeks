import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'favicon.ico',
        'apple-touch-icon-180x180.png',
        'maskable-icon-512x512.png',
        'icon.svg',
      ],
      manifest: {
        name: 'RipPack',
        short_name: 'RipPack',
        description: 'Free pro football card packs',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#111827',
        theme_color: '#111827',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  resolve: { alias: { "@": "/src" } },
  server: { fs: { allow: [".."] } },
  test: { environment: 'jsdom', setupFiles: ['./vitest.setup.ts'], globals: true },
})
