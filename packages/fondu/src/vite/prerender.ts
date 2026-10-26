import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { Logger } from 'vite'

import { PAGE_DATA, staticFiles } from '../paths.js'

export { staticFiles }

/** the response headers a static document keeps: the security headers (hono/secure-headers' and the like) */
const SECURITY_HEADERS =
  /^(content-security-policy(-report-only)?|strict-transport-security|referrer-policy|permissions-policy|x-content-type-options|x-frame-options|x-xss-protection|x-dns-prefetch-control|x-download-options|x-permitted-cross-domain-policies|origin-agent-cluster|cross-origin-(opener|embedder|resource)-policy)$/i

/**
 * A static document's own tags: those with the build's nonce (its Content Security Policy's). The nonce of a static
 * document is replaced (Cloudflare: its inline scripts by their hashes; Node / Bun: by each response's nonce), which
 * only these may get: a `nonce` the document has otherwise (in a page's markup) is dropped. Then the hashes of these
 * inline scripts.
 */
export function ownScripts(
  html: string,
  policy: string | undefined,
): { html: string; hashes: string[] } {
  const nonce = policy?.match(/'nonce-([^']+)'/)?.[1]
  if (!nonce) return { html, hashes: [] }
  const own = html.replace(
    /(<(?:script|link)\b[^>]*?)\snonce="([^"]*)"/gi,
    (tag, before: string, value: string) => (value === nonce ? tag : before),
  )
  const hashes = new Set<string>()
  for (const [, attrs, code] of own.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))
    if (attrs!.includes(` nonce="${nonce}"`) && !/\ssrc=/i.test(attrs!))
      hashes.add(`'sha256-${createHash('sha256').update(code!).digest('base64')}'`)
  return { html: own, hashes: [...hashes] }
}

/**
 * A Content Security Policy for a static document: no nonce (one for every visitor is none); the scripts that had it
 * allowed by their hashes instead, and `'self'` scripts
 */
export function staticPolicy(policy: string, hashes: string[] = []): string {
  return policy
    .split(';')
    .map((directive) => {
      const [name, ...sources] = directive.trim().split(/\s+/)
      if (!name) return ''
      const kept = sources.filter((s) => !s.startsWith("'nonce-"))
      if (kept.length < sources.length && /^script-src(-elem)?$/i.test(name)) kept.push(...hashes)
      if (/^script-src(-elem)?$/i.test(name) && kept.length === 0) kept.push("'self'")
      return [name, ...kept].join(' ')
    })
    .filter(Boolean)
    .join('; ')
}

/**
 * `_headers` with Fondu's rules in it: the documents' security headers (`/*`), and the page objects' X-Fondu
 * (the client reads a page by it). A path the file has a rule for gets the headers it doesn't set there, so the app's own stay
 * (Workers keep one rule per path: a second `/*` would replace the first); any other, a rule at the end.
 */
export function withHeaderRules(file: string, headers: Record<string, string>): string {
  const lines = file.replace(/\n+$/, '').split('\n')
  const rules: Array<[string, Record<string, string>]> = [
    ['/*', headers],
    [`${PAGE_DATA}/*`, { 'X-Fondu': 'true' }],
  ]
  for (const [path, set] of rules) {
    const start = lines.findIndex((line) => line.trimEnd() === path)
    let end = start + 1
    while (start !== -1 && /^\s+\S/.test(lines[end] ?? '')) end++
    // the names set or removed (`! name`) there
    const own = new Set(
      lines
        .slice(start + 1, end)
        .map((l) => l.trim().replace(/^!\s*/, '').split(':')[0]!.toLowerCase()),
    )
    const added = Object.entries(set)
      .filter(([name]) => start === -1 || !own.has(name.toLowerCase()))
      .map(([name, value]) => `  ${name}: ${value}`)
    if (start === -1) lines.push(...(lines.at(-1) ? [''] : []), path, ...added)
    else lines.splice(end, 0, ...added)
  }
  return `${lines.join('\n')}\n`
}

/** the built server, running for the prerender: fetch a path of it, stop it */
interface Server {
  fetch(path: string, headers?: Record<string, string>): Promise<Response>
  dispose(): Promise<void>
}

/**
 * After the build: the built server (the Worker in wrangler, or `node` / `bun dist/server/index.js`), started with
 * `FONDU_PRERENDER` set, lists the pages to prerender (`/__fondu/prerender`); each is asked for as a document and as
 * a navigation, and both are written to the client build. Cloudflare serves them before the Worker, with the security
 * headers written to `_headers`; Node and Bun before the routes, behind the app's own headers.
 */
export async function prerender(
  start: () => Promise<Server>,
  clientDir: string,
  logger: Logger,
  headersFile: boolean,
) {
  const fail = (lines: string[]): never => {
    for (const line of lines) logger.error(`fondu: ${line}`)
    throw new Error(
      `fondu: prerendering failed (${lines.length === 1 ? lines[0] : `${lines.length} problems, above`})`,
    )
  }
  const server = await start().catch((error: Error) => fail([error.message]))
  try {
    const get = server.fetch
    const listing = await get('/__fondu/prerender')
    if (!listing.ok) return fail([`the server did not list the pages (${listing.status})`])
    const { version, paths, problems } = (await listing.json()) as {
      version: string | null
      paths: string[]
      problems: string[]
    }
    if (problems.length) return fail(problems)
    if (paths.length === 0) {
      logger.warn('fondu: prerender is on, and no route has `export const prerender`')
      return
    }

    let security: Record<string, string> | undefined
    const errors: string[] = []
    for (const path of paths) {
      const doc = await get(path, { Accept: 'text/html' })
      const visit = await get(path, {
        'X-Fondu': 'true',
        ...(version && { 'X-Fondu-Version': version }),
      })
      if (doc.status !== 200 || visit.status !== 200) {
        const to = doc.headers.get('location')
        errors.push(
          `${path}: ${doc.status}${to ? ` → ${to}` : ''} (a prerendered page must answer 200 to anyone)`,
        )
        continue
      }
      const page = (await visit.json()) as Record<string, unknown>
      const { html, hashes } = ownScripts(
        await doc.text(),
        doc.headers.get('content-security-policy') ?? undefined,
      )
      const headers = Object.fromEntries(
        [...doc.headers]
          .filter(([name]) => SECURITY_HEADERS.test(name))
          .map(([name, value]) => [
            name,
            /^content-security-policy/i.test(name) ? staticPolicy(value, hashes) : value,
          ]),
      )
      if (headersFile && security && JSON.stringify(headers) !== JSON.stringify(security)) {
        errors.push(
          `${path}: its security headers differ from ${paths[0]}'s; one set is written for all`,
        )
        continue
      }
      security = headers
      const files = staticFiles(path)
      write(clientDir, files.html, html)
      write(clientDir, files.json, JSON.stringify(page))
      logger.info(`fondu: prerendered ${path}`)
    }
    if (errors.length) return fail(errors)
    if (headersFile) {
      const file = join(clientDir, '_headers')
      const own = existsSync(file) ? readFileSync(file, 'utf8') : ''
      writeFileSync(file, withHeaderRules(own, security ?? {}))
    }
  } finally {
    await server.dispose()
  }
}

/** Cloudflare: the built Worker, in the app's own wrangler (fondu does not depend on it) */
export const worker = (root: string, workerConfig: string) => async (): Promise<Server> => {
  let wrangler: Wrangler
  try {
    const entry = createRequire(resolve(root, 'package.json')).resolve('wrangler')
    wrangler = (await import(pathToFileURL(entry).href)) as Wrangler
  } catch {
    throw new Error('wrangler is not installed: `npm install -D wrangler` (or bun / pnpm / yarn)')
  }
  const started = await wrangler.unstable_startWorker({
    config: workerConfig,
    bindings: { FONDU_PRERENDER: { type: 'plain_text', value: '1' } },
    dev: { server: { port: 0 }, inspector: false, logLevel: 'error' },
  })
  await started.ready
  return {
    // a Worker that throws as it starts: wrangler logs it, then its requests never answer
    fetch: (path, headers = {}) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const late = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`the Worker did not answer ${path} (an error above?)`)),
          60_000,
        )
      })
      return Promise.race([
        started.fetch(new URL(path, 'http://localhost').href, { headers, redirect: 'manual' }),
        late,
      ]).finally(() => clearTimeout(timer))
    },
    dispose: () => started.dispose(),
  }
}

/** Node / Bun: `node dist/server/index.js` (or `bun`), on a free port, until it answers */
export const nodeServer = (root: string, runtime: 'node' | 'bun') => async (): Promise<Server> => {
  const port = await freePort()
  const child = spawn(runtime, ['dist/server/index.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), FONDU_PRERENDER: '1', NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (d: Buffer) => (output += d))
  child.stderr.on('data', (d: Buffer) => (output += d))
  const base = `http://127.0.0.1:${port}`
  const server: Server = {
    fetch: (path, headers = {}) => fetch(base + path, { headers, redirect: 'manual' }),
    dispose: async () => {
      if (child.exitCode !== null) return
      const exited = new Promise((r) => child.once('exit', r))
      child.kill()
      const force = setTimeout(() => child.kill('SIGKILL'), 3000)
      await exited
      clearTimeout(force)
    },
  }
  for (let tries = 0; ; tries++) {
    if (child.exitCode !== null || tries === 200)
      throw new Error(
        `the server (${runtime} dist/server/index.js) did not start:\n${output.trim()}`,
      )
    try {
      await fetch(base + '/__fondu/prerender')
      return server
    } catch {
      await new Promise((r) => setTimeout(r, 50))
    }
  }
}

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = createServer()
    s.on('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number }
      s.close(() => resolve(port))
    })
  })

/** what is used of wrangler's API (the app's own wrangler: fondu does not depend on it) */
interface Wrangler {
  unstable_startWorker(options: {
    config: string
    bindings: Record<string, { type: 'plain_text'; value: string }>
    dev: { server: { port: number }; inspector: false; logLevel: 'error' }
  }): Promise<{
    ready: Promise<void>
    fetch(url: string, init: RequestInit): Promise<Response>
    dispose(): Promise<void>
  }>
}

function write(dir: string, file: string, content: string) {
  const to = join(dir, file)
  mkdirSync(dirname(to), { recursive: true })
  writeFileSync(to, content)
}
