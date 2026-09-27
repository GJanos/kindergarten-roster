import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // GitHub Pages serves a project site from /<repo>/; CI sets BASE_PATH.
  base: process.env.BASE_PATH ?? '/',
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev') },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Óvodai beosztás',
        short_name: 'Beosztás',
        lang: 'hu',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#2f6f4f',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,wasm,svg}'],
        // highs.wasm is 3.5 MB; Workbox silently skips files over 2 MiB unless told otherwise.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  worker: { format: 'es' },
})
