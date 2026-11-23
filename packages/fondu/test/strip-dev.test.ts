import { readFileSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'

import { createServer, type ViteDevServer } from 'vite'
import { afterEach, describe, expect, test, vi } from 'vitest'

import fondu from '../src/vite/index.js'
import { stripRoutes } from '../src/vite/strip.js'
import { tempApp } from './support/build.js'

const canary = 'CANARY_LOADER_SECRET_7f3a'
const route = [
  `import { db } from '../db.server'`,
  `import { Badge } from '../badge'`,
  `export async function loader() { return { secret: '${canary}', db } }`,
  `export const title = 'PAGE_TITLE'`,
  `export default function Page() { return <Badge>KEPT_IN_THE_BROWSER</Badge> }`,
  ``,
].join('\n')
const files = {
  'app/routes/index.tsx': route,
  'app/badge.tsx': 'export const Badge = (p) => <b>{p.children}</b>\n',
  'app/db.server.ts': 'export const db = 1\n',
}

let app: ReturnType<typeof tempApp> | undefined
let dev: ViteDevServer | undefined
afterEach(async () => {
  await dev?.close()
  app?.remove()
  dev = app = undefined
})

async function start(target: 'node' | 'cloudflare' = 'node') {
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
  return { port, url: `http://127.0.0.1:${port}` }
}

async function module(url: string, path: string) {
  const res = await fetch(url + path)
  expect(res.status).toBe(200)
  const code = await res.text()
  const inline = /\/\/# sourceMappingURL=data:application\/json;base64,(.*)$/m.exec(code)
  expect(inline, 'the module has an inline source map').not.toBeNull()
  const map = JSON.parse(Buffer.from(inline![1]!, 'base64').toString()) as {
    sources: string[]
    sourcesContent: Array<string | null>
    mappings: string
  }
  return { code, map }
}

describe('the browser’s copy of a route file in development', () => {
  for (const target of ['node', 'cloudflare'] as const)
    test(`${target}: the module and its inline map have no loader`, async () => {
      const { url } = await start(target)
      const { code, map } = await module(url, '/app/routes/index.tsx')
      expect(code).toContain('KEPT_IN_THE_BROWSER')
      expect(code).not.toContain(canary)
      expect(code).not.toContain('db.server')
      expect(map.mappings).not.toBe('')
      expect(map.sources).toHaveLength(1)
      expect(map.sourcesContent).toHaveLength(1)
      const source = map.sourcesContent[0]!
      expect(source).not.toContain(canary)
      expect(source).not.toContain('loader')
      expect(source).not.toContain('db.server')
      expect(source).toContain("import { Badge } from '../badge'")
      expect(source.split('\n')).toHaveLength(route.split('\n').length)
      expect(source.split('\n')[4]).toBe(route.split('\n')[4])
    })

  test('?t=, ?direct and ?html-proxy are the same file: stripped alike', async () => {
    const { url } = await start()
    for (const query of ['?t=1700000000000', '?direct', '?html-proxy']) {
      const { code, map } = await module(url, `/app/routes/index.tsx${query}`)
      expect(code, query).toContain('KEPT_IN_THE_BROWSER')
      expect(code, query).not.toContain(canary)
      expect(JSON.stringify(map), query).not.toContain(canary)
    }
  })

  test('the server keeps the whole file', async () => {
    await start()
    const ssr = await dev!.environments.ssr!.transformRequest('/app/routes/index.tsx')
    expect(ssr!.code).toContain(canary)
    expect(ssr!.code).toContain('db.server')
  })

  test('the page module’s exports, for Fast Refresh, are the browser’s copy’s', async () => {
    const { url } = await start()
    const { code } = await module(url, '/app/routes/index.tsx')
    expect(code).toMatch(/__fondu_pageExports.*\["title"\]/s)
  })

  test('a change to the route file: Fast Refresh updates it, and the new copy is stripped too', async () => {
    const { port, url } = await start()
    await module(url, '/app/routes/index.tsx')
    const messages: Array<{ type: string; updates?: Array<{ type: string; path: string }> }> = []
    const socket = new WebSocket(
      `ws://127.0.0.1:${port}/?token=${dev!.config.webSocketToken}`,
      'vite-hmr',
    )
    socket.onmessage = (e) => messages.push(JSON.parse(String(e.data)))
    await vi.waitFor(() => expect(messages.map((m) => m.type)).toContain('connected'))
    const file = join(app!.root, 'app/routes/index.tsx')
    writeFileSync(
      file,
      readFileSync(file, 'utf8')
        .replace('KEPT_IN_THE_BROWSER', 'CHANGED_PAGE')
        .replace(canary, 'CANARY_TWO_9c1e'),
    )
    await vi.waitFor(() => expect(messages.map((m) => m.type)).toContain('update'), {
      timeout: 5000,
    })
    socket.close()
    const update = messages.find((m) => m.type === 'update')!
    expect(update.updates).toEqual([
      expect.objectContaining({ type: 'js-update', path: '/app/routes/index.tsx' }),
    ])
    expect(messages.map((m) => m.type)).not.toContain('full-reload')
    const { code, map } = await module(url, '/app/routes/index.tsx?t=1')
    expect(code).toContain('CHANGED_PAGE')
    expect(code).not.toContain('CANARY_TWO_9c1e')
    expect(JSON.stringify(map)).not.toContain('CANARY_TWO_9c1e')
    expect(map.sourcesContent[0]).toContain('CHANGED_PAGE')
  })
})

describe('the dependency scan', () => {
  test('finds the dependencies of the browser’s copy: not a loader’s, not a type-only import’s', async () => {
    app = tempApp({
      'app/routes/index.tsx': [
        `import { renderToString } from 'react-dom/server'`,
        `import type { Foo } from 'react-dom/static'`,
        `import { type Bar } from 'react-dom/test-utils'`,
        `export const loader = () => renderToString(null)`,
        `export default function Page(p: { a: Foo; b: Bar }) { return <p>hi</p> }`,
        ``,
      ].join('\n'),
    })
    dev = await createServer({
      root: app.root,
      configFile: false,
      logLevel: 'silent',
      server: { port: 0, host: '127.0.0.1' },
      plugins: [fondu({ target: 'node' })],
    })
    await dev.listen()
    const optimizer = dev.environments.client.depsOptimizer!
    await optimizer.scanProcessing
    const found = Object.keys(optimizer.metadata.discovered)
    expect(found).toContain('react/jsx-dev-runtime')
    for (const server of ['react-dom/server', 'react-dom/static', 'react-dom/test-utils'])
      expect(found).not.toContain(server)
  })
})

describe('the hook', () => {
  // `?worker_file` is a build's (a worker's entry); the hook is the same one, asked for that id
  const load = async (id: string, consumer = 'client') => {
    const plugin = stripRoutes()
    ;(plugin.configResolved as (c: unknown) => void)({ root: app!.root })
    const hook = plugin.load as {
      handler: (this: unknown, id: string) => Promise<string | undefined>
    }
    return hook.handler.call({ environment: { config: { consumer } } }, id)
  }

  test('?worker_file is stripped, the other modules of the file are Vite’s, the server’s is whole', async () => {
    app = tempApp(files)
    const id = join(app.root, 'app/routes/index.tsx')
    expect(await load(`${id}?worker_file&type=module`)).not.toContain(canary)
    expect(await load(`${id}?worker_file&type=module`)).toContain('KEPT_IN_THE_BROWSER')
    expect(await load(`${id}?direct`)).not.toContain(canary)
    expect(await load(`${id}?html-proxy&index=0.js`)).not.toContain(canary)
    expect(await load(`${id}?t=1`)).not.toContain(canary)
    for (const query of ['?raw', '?url', '?inline', '?worker', '?sharedworker', '?no-inline'])
      expect(await load(id + query), query).toBeUndefined()
    expect(await load(id, 'server')).toBeUndefined()
    writeFileSync(id, 'export default function Page() { return <p> }')
    await expect(load(id)).rejects.toThrow(/^fondu: routes\/index\.tsx: Parse failed/)
    for (const other of ['app/routes/_layout.tsx', 'app/routes/_parts/x.tsx', 'app/badge.tsx'])
      expect(await load(join(app.root, other)), other).toBeUndefined()
  })
})
