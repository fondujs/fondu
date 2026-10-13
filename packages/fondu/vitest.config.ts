import { fileURLToPath } from 'node:url'

import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// The protocol, tested on a small app (test/app/) with `app.request()`, as Hono apps are tested. The Vite plugin's
// virtual modules are replaced by fixed ones: asset version "v1", no server render.
const virtual: Plugin = {
  name: 'fondu-test-virtual',
  resolveId: (id) => (id.startsWith('virtual:fondu/') ? '\0' + id : undefined),
  load(id) {
    if (id === '\0virtual:fondu/assets')
      return `export const version = 'v1'; export const pages = null; export const prerender = true; export const assetTags = () => ''`
    if (id === '\0virtual:fondu/ssr') return 'export const renderPage = null'
  },
}

export default defineConfig({
  root: fileURLToPath(new URL('./test', import.meta.url)),
  plugins: [virtual],
  resolve: { alias: { fondu: fileURLToPath(new URL('./src/index.ts', import.meta.url)) } },
  test: { include: ['*.test.ts'] },
})
