import type { AddressInfo } from 'node:net'

import { createServer, type ViteDevServer } from 'vite'
import { afterEach, describe, expect, test } from 'vitest'

import fondu from '../src/vite/index.js'
import { tempApp } from './support/build.js'

// dev, Node and Bun: the app's .env files are in process.env (Cloudflare has its own, .dev.vars)
const server = `import { Hono } from 'hono'
export default new Hono().get('/', (c) => c.json({
  plain: process.env.FONDU_TEST_PLAIN ?? null,
  set: process.env.FONDU_TEST_SET ?? null,
  local: process.env.FONDU_TEST_LOCAL ?? null,
  mode: process.env.FONDU_TEST_MODE ?? null,
  production: process.env.FONDU_TEST_PRODUCTION ?? null,
}))
`
const files = {
  'app/server.ts': server,
  '.env': 'FONDU_TEST_PLAIN=from-env\nFONDU_TEST_SET=from-file\nFONDU_TEST_LOCAL=from-env\n',
  '.env.local': 'FONDU_TEST_LOCAL=from-local\n',
  '.env.development': 'FONDU_TEST_MODE=development\n',
  '.env.production': 'FONDU_TEST_PRODUCTION=wrong\n',
}

let app: ReturnType<typeof tempApp> | undefined
let dev: ViteDevServer | undefined
afterEach(async () => {
  await dev?.close()
  app?.remove()
  for (const k of Object.keys(process.env)) if (k.startsWith('FONDU_TEST_')) delete process.env[k]
})

async function request(target: 'node' | 'bun' | 'cloudflare') {
  app = tempApp(files)
  dev = await createServer({
    root: app.root,
    configFile: false,
    logLevel: 'silent',
    server: { port: 0, host: '127.0.0.1' },
    plugins: [fondu({ target })],
  })
  await dev.listen()
  const { port } = dev.httpServer!.address() as AddressInfo
  const res = await fetch(`http://127.0.0.1:${port}/`)
  return { res, body: (await res.json()) as Record<string, string | null> }
}

describe('.env in development', () => {
  for (const target of ['node', 'bun'] as const)
    test(`${target}: a request sees the .env files' values; a variable already set wins`, async () => {
      process.env.FONDU_TEST_SET = 'from-shell'
      const { body } = await request(target)
      expect(body).toEqual({
        plain: 'from-env',
        set: 'from-shell',
        local: 'from-local', // .env.local over .env, as Vite's own
        mode: 'development',
        production: null,
      })
    })

  test('cloudflare: process.env is left alone (its variables are .dev.vars)', async () => {
    // a Worker's app has no Node server in dev: only the plugin's own work is checked
    app = tempApp(files)
    dev = await createServer({
      root: app.root,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true },
      plugins: [fondu({ target: 'cloudflare' })],
    })
    expect(process.env.FONDU_TEST_PLAIN).toBeUndefined()
  })
})
