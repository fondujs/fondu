import { fileURLToPath } from 'node:url'

import { normalizePath } from 'vite'

import type { FonduOptions } from './index.js'

export const SERVER = './app/server.ts'
const staticModule = normalizePath(fileURLToPath(new URL('../server/static.js', import.meta.url)))

// `paths`: the client build's files and directories. `assetsDir`: its hashed files, served as immutable only when
// serveStatic found the file (an app's route under the same URL keeps its own Cache-Control).
export function entryCode(
  options: FonduOptions,
  paths: string[],
  assetsDir = 'assets',
  prerender = false,
): string {
  const bun = options.target === 'bun'
  const hashed = assetsDir ? `/${assetsDir}/*` : undefined
  return [
    // NODE_ENV first, the rest imported after it: static imports run before this line, and React picks its build when first
    // loaded
    `process.env.NODE_ENV ??= 'production'`,
    `const { Hono } = await import('hono')`,
    `const { serveStatic } = await import('${bun ? 'hono/bun' : '@hono/node-server/serve-static'}')`,
    `const { fileURLToPath } = await import('node:url')`,
    `const { default: app } = await import('${SERVER.slice(1)}')`,
    `const clientRoot = fileURLToPath(new URL('../client', import.meta.url))`,
    `const main = new Hono()`,
    // prerender.json is written after this server is built: absent while the build prerenders, so the app renders them then
    ...(prerender
      ? [
          `const { existsSync, readFileSync } = await import('node:fs')`,
          `const { staticPages } = await import(${JSON.stringify(staticModule)})`,
          `const prerendered = fileURLToPath(new URL('./prerender.json', import.meta.url))`,
          `if (existsSync(prerendered)) { const { headers, files } = JSON.parse(readFileSync(prerendered, 'utf8')); main.use('*', staticPages(serveStatic, clientRoot, headers, files)) }`,
        ]
      : []),
    ...(hashed
      ? [
          `main.use(${JSON.stringify(hashed)}, serveStatic({ root: clientRoot, onFound: (_path, c) => c.header('Cache-Control', 'public, max-age=31536000, immutable') }))`,
        ]
      : []),
    ...paths
      .filter((p) => p !== hashed)
      .map((p) => `main.use(${JSON.stringify(p)}, serveStatic({ root: clientRoot }))`),
    `main.all('*', (c) => app.fetch(c.req.raw, c.env))`,
    ...(bun
      ? [
          // Bun reads PORT (BUN_PORT and NODE_PORT too), else 3000
          `export default app.websocket ? { fetch: main.fetch, websocket: app.websocket } : main`,
        ]
      : [
          `const { serve } = await import('@hono/node-server')`,
          `const server = serve({ fetch: main.fetch, port: Number(process.env.PORT) || 3000 }, (info) => console.log(\`Listening on http://localhost:\${info.port}\`))`,
          `const shutdown = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 10_000).unref() }`,
          `process.on('SIGINT', shutdown)`,
          `process.on('SIGTERM', shutdown)`,
          `export default main`,
        ]),
  ].join('\n')
}
