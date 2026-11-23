import { createServer, type ViteDevServer } from 'vite'
import { afterEach, expect, test } from 'vitest'

import * as client from '../src/client.js'
import * as internal from '../src/client/internal.js'
import fondu from '../src/vite/index.js'
import { fonduInstalled, isInstalled } from '../src/vite/installed.js'
import { tempApp } from './support/build.js'

// The plugin's generated entries import `fondu/client/internal` (the internals) and `fondu/client` (`reload`, in dev):
// every name they import is exported there, and both are pre-bundled in the one run (one module of the client)
let app: ReturnType<typeof tempApp> | undefined
let dev: ViteDevServer | undefined
afterEach(async () => {
  await dev?.close()
  app?.remove()
})

const modules = { 'fondu/client': client, 'fondu/client/internal': internal } as Record<
  string,
  Record<string, unknown>
>

function imports(code: string) {
  return [...code.matchAll(/^import \{ ([^}]*) \} from '(fondu\/[\w/]+)'$/gm)].map((m) => ({
    from: m[2]!,
    names: m[1]!.split(',').map((n) => n.trim().split(' as ')[0]!),
  }))
}

test('the generated entries import only what fondu/client and fondu/client/internal export', async () => {
  app = tempApp({ 'app/server.ts': `import { Hono } from 'hono'\nexport default new Hono()\n` })
  dev = await createServer({
    root: app.root,
    configFile: false,
    logLevel: 'silent',
    server: { middlewareMode: true },
    plugins: [fondu({ target: 'node' })],
  })
  const container = dev.environments.client.pluginContainer
  const entry = await container.load('\0virtual:fondu/entry')
  const ssr = await container.load('\0virtual:fondu/ssr')
  const code = (loaded: typeof entry) =>
    typeof loaded === 'string' ? loaded : (loaded?.code ?? '')
  const found = [...imports(code(entry)), ...imports(code(ssr))]
  expect(found.map((i) => `${i.from}: ${i.names.join(', ')}`).sort()).toEqual([
    'fondu/client/internal: __entry',
    'fondu/client/internal: renderPage',
    'fondu/client: reload',
  ])
  for (const { from, names } of found)
    for (const name of names)
      expect(Object.keys(modules[from]!), `${name} from ${from}`).toContain(name)
  // run from src/ (not in node_modules): fondu is linked, as in the workspace, so nothing is pre-bundled for it
  expect(dev.environments.client.config.optimizeDeps.include).not.toContain('fondu/client')
})

test('fondu/client is pre-bundled for an installed fondu only, not a linked one', () => {
  expect(isInstalled('/app/node_modules/fondu/dist/vite/index.js')).toBe(true)
  expect(
    isInstalled('/app/node_modules/.bun/fondu@1.0.0/node_modules/fondu/dist/vite/index.js'),
  ).toBe(true)
  expect(isInstalled('C:\\app\\node_modules\\fondu\\dist\\vite\\index.js')).toBe(true)
  expect(isInstalled('/repo/packages/fondu/dist/vite/index.js')).toBe(false)
  expect(isInstalled('/repo/node_modules_old/fondu/dist/vite/index.js')).toBe(false)
  expect(fonduInstalled()).toBe(false)
})

// `viewTransitions` reaches the browser as a setting of the entry (the default of each navigation), not as a build-time
// constant: the entry imports `__entry` alone, whatever the option
test('the entry carries viewTransitions as a setting, and nothing else of it', async () => {
  for (const on of [true, false, undefined]) {
    app = tempApp({ 'app/server.ts': `import { Hono } from 'hono'\nexport default new Hono()\n` })
    dev = await createServer({
      root: app.root,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true },
      plugins: [fondu({ target: 'node', viewTransitions: on })],
    })
    const loaded = await dev.environments.client.pluginContainer.load('\0virtual:fondu/entry')
    const code = typeof loaded === 'string' ? loaded : (loaded?.code ?? '')
    expect(code).toContain(`"viewTransitions":${on === true}`)
    expect(code).toContain("import { __entry } from 'fondu/client/internal'")
    expect(code).not.toContain('VIEW_TRANSITIONS')
    expect(dev.config.define ?? {}).not.toHaveProperty('__FONDU_VIEW_TRANSITIONS__')
    await dev.close()
    dev = undefined
    app.remove()
  }
})
