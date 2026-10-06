import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png', 'maskable-icon-512x512.png', 'icon.svg'],
      manifest: {
        name: 'Rollout',
        short_name: 'Rollout',
        description: 'Random pro football player scout',
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
          exclude: [...configDefaults.exclude] },
})
