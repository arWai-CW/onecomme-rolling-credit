import { resolve } from 'node:path'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

export const OUT_DIR = resolve(import.meta.dirname, 'dist/onecomme-rolling-credit')

export default defineConfig({
  // Pages are served from http://localhost:11180/plugins/<uid>/, so use relative asset paths.
  base: './',
  plugins: [svelte()],
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        settings: resolve(import.meta.dirname, 'settings.html'),
      },
    },
  },
})
