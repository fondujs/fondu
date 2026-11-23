// A small app built for Node, Bun or Cloudflare by fondu's plugin (from src/), and the built server started. It is in a
// directory of its own under test/, which finds its dependencies in apps/conformance (apps/site for Cloudflare: it has
// @cloudflare/vite-plugin and wrangler).
import { type ChildProcess, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { createBuilder } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const plugin = join(here, '../src/vite/index.ts')
const modules = join(here, '../../../apps/conformance/node_modules')
const workerModules = join(here, '../../../apps/site/node_modules')

export const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = createServer()
    s.on('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number }
      s.close(() => resolve(port))
    })
  })

export interface BuiltApp {
  dir: string
  server: string
  remove(): void
}

export async function buildApp(
  files: Record<string, string>,
  {
    assetsDir,
    target = 'node',
  }: { assetsDir?: string; target?: 'node' | 'bun' | 'cloudflare' } = {},
): Promise<BuiltApp> {
  const dir = mkdtempSync(join(here, '.built-'))
  const worker = target === 'cloudflare'
  symlinkSync(worker ? workerModules : modules, join(dir, 'node_modules'))
  const all: Record<string, string> = {
    'package.json': JSON.stringify({
      type: 'module',
      dependencies: { '@hono/node-server': '*', hono: '*', react: '*', 'react-dom': '*' },
    }),
    ...(worker && {
      'wrangler.jsonc': JSON.stringify({
        name: 'test',
        main: './app/server.ts',
        compatibility_date: '2026-10-01',
      }),
    }),
    'vite.config.ts': [
      `import fondu from ${JSON.stringify(plugin)}`,
      ...(worker ? [`import { cloudflare } from '@cloudflare/vite-plugin'`] : []),
      `import { defineConfig } from 'vite'`,
      `export default defineConfig({ logLevel: 'silent', ${assetsDir ? `build: { assetsDir: ${JSON.stringify(assetsDir)} }, ` : ''}plugins: [${worker ? `cloudflare({ viteEnvironment: { name: 'ssr' } }), ` : ''}fondu({ target: '${target}', progress: false })] })`,
    ].join('\n'),
    'app/server.ts': `import { createApp } from 'fondu'\nexport default createApp()\n`,
    ...files,
  }
  for (const [file, text] of Object.entries(all)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true })
    writeFileSync(join(dir, file), text)
  }
  try {
    const builder = await createBuilder({ root: dir, configFile: join(dir, 'vite.config.ts') })
    await builder.buildApp()
  } catch (error) {
    rmSync(dir, { recursive: true, force: true })
    throw error
  }
  return {
    dir,
    server: join(dir, worker ? 'dist/ssr' : 'dist/server'),
    remove: () => rmSync(dir, { recursive: true, force: true }),
  }
}

export interface Running {
  url: string
  stop(): Promise<void>
}

/** `env` is added to the test's own, but for `NODE_ENV`, which `env` decides (unset: not there) */
export async function start(
  app: BuiltApp,
  env: Record<string, string> = {},
  runtime = 'node',
): Promise<Running> {
  const port = await freePort()
  const { NODE_ENV: _, ...rest } = process.env
  const child: ChildProcess = spawn(runtime, [join(app.server, 'index.js')], {
    cwd: app.dir,
    env: { ...rest, ...env, PORT: String(port) },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  let output = ''
  child.stderr!.on('data', (d: Buffer) => (output += d))
  const exited = new Promise<void>((r) => child.once('exit', () => r()))
  const url = `http://127.0.0.1:${port}`
  for (let i = 0; i < 400; i++) {
    if (child.exitCode !== null) throw new Error(`the server exited: ${output}`)
    if (
      await fetch(url, { signal: AbortSignal.timeout(2000) }).then(
        () => true,
        () => false,
      )
    )
      break
    await new Promise((r) => setTimeout(r, 50))
  }
  return {
    url,
    stop: async () => {
      child.kill()
      await exited
    },
  }
}

export interface RunningWorker {
  fetch(path: string, init?: RequestInit): Promise<Response>
  stop(): Promise<void>
}

/** A Cloudflare build, run in workerd by wrangler (as the prerender step does) */
export async function startWorker(app: BuiltApp): Promise<RunningWorker> {
  const entry = createRequire(join(app.dir, 'package.json')).resolve('wrangler')
  const wrangler = (await import(pathToFileURL(entry).href)) as {
    unstable_startWorker(options: object): Promise<{
      ready: Promise<void>
      fetch(url: string, init?: RequestInit): Promise<Response>
      dispose(): Promise<void>
    }>
  }
  const worker = await wrangler.unstable_startWorker({
    config: join(app.server, 'wrangler.json'),
    dev: { server: { port: 0 }, inspector: false, logLevel: 'error' },
  })
  await worker.ready
  return {
    fetch: (path, init) => worker.fetch(new URL(path, 'http://localhost').href, init),
    stop: () => worker.dispose(),
  }
}
