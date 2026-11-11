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
      return `export const version = 'v1'; export const prerender = true; export const assetTags = () => ''`
    if (id === '\0virtual:fondu/ssr')
      return [
        `import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server'`,
        `import { __entry, renderPage as render } from 'fondu/client'`,
        `__entry(import.meta.glob(['/app/routes/**/*.tsx', '!/app/routes/**/_layout.tsx']), import.meta.glob('/app/routes/**/_layout.tsx'), { prerender: false, progress: false })`,
        `export const renderPage = (page, options, after) => render(page, (el) => renderToReadableStream(el, options), after)`,
        `export { renderToStaticMarkup as renderMarkup }`,
      ].join('\n')
  },
}

export default defineConfig({
  root: fileURLToPath(new URL('./test', import.meta.url)),
  plugins: [virtual],
  resolve: {
    alias: [
      {
        find: /^fondu\/client$/,
        replacement: fileURLToPath(new URL('./src/client.ts', import.meta.url)),
      },
      { find: /^fondu$/, replacement: fileURLToPath(new URL('./src/index.ts', import.meta.url)) },
    ],
  },
  test: { include: ['*.test.ts'] },
})
