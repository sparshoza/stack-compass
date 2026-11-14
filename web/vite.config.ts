/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@catalog': fileURLToPath(new URL('../catalog', import.meta.url)),
    },
  },
  build: {
    // The main chunk inlines catalog/catalog.json (about 520 kB of the 750 kB),
    // which the map, the table and the recommender all need at first paint, so
    // splitting it out would only add a request. sigma loads in its own chunk.
    chunkSizeWarningLimit: 800,
  },
  server: {
    fs: { allow: ['.', '../catalog'] },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
