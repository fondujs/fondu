import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { Logger } from 'vite'

import { PAGE_DATA, pageDataPath } from '../paths.js'

/** the response headers a static document keeps: the security headers (hono/secure-headers' and the like) */
const SECURITY_HEADERS =
  /^(content-security-policy(-report-only)?|strict-transport-security|referrer-policy|permissions-policy|x-content-type-options|x-frame-options|x-xss-protection|x-dns-prefetch-control|x-download-options|x-permitted-cross-domain-policies|origin-agent-cluster|cross-origin-(opener|embedder|resource)-policy)$/i

/** a Content Security Policy for a static document: no nonce (one for every visitor is none), `'self'` scripts */
export function staticPolicy(policy: string): string {
  return policy
    .split(';')
    .map((directive) => {
      const [name, ...sources] = directive.trim().split(/\s+/)
      if (!name) return ''
      const kept = sources.filter((s) => !s.startsWith("'nonce-"))
      if (/^script-src(-elem)?$/i.test(name) && kept.length === 0) kept.push("'self'")
      return [name, ...kept].join(' ')
    })
    .filter(Boolean)
    .join('; ')
}

/** the files of a page: `/docs/intro` → `docs/intro.html` and `_fondu/pages/docs/intro.json` (paths decoded) */
export function staticFiles(path: string): { html: string; json: string } {
  const html = decodeURIComponent(path.endsWith('/') ? path + 'index.html' : path + '.html').slice(1)
  return { html, json: decodeURIComponent(pageDataPath(path)).slice(1) }
}

/** the `_headers` rules: the documents' security headers, and the page objects' X-Inertia (Inertia requires it) */
export function headerRules(headers: Record<string, string>): string {
  const lines = Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`)
  return `\n/*\n${lines.join('\n')}\n${PAGE_DATA}/*\n  X-Inertia: true\n`
}

/**
 * After `vite build` (Cloudflare): the built Worker, started by wrangler with `FONDU_PRERENDER` set, lists the
 * pages to prerender (`/__fondu/prerender`); each is asked for as a document and as a visit, and both are written
 * to the client build, which Workers Static Assets serve before the Worker.
 */
export async function prerender(root: string, workerConfig: string, clientDir: string, logger: Logger) {
  const fail = (lines: string[]) => {
    for (const line of lines) logger.error(`fondu: ${line}`)
    throw new Error(`fondu: prerendering failed (${lines.length === 1 ? lines[0] : `${lines.length} problems, above`})`)
  }
  let wrangler: Wrangler
  try {
    const entry = createRequire(resolve(root, 'package.json')).resolve('wrangler')
    wrangler = (await import(pathToFileURL(entry).href)) as Wrangler
  } catch {
    return fail(['wrangler is not installed: `npm install -D wrangler` (or bun / pnpm / yarn)'])
  }
  const worker = await wrangler.unstable_startWorker({
    config: workerConfig,
    bindings: { FONDU_PRERENDER: { type: 'plain_text', value: '1' } },
    dev: { server: { port: 0 }, inspector: false, logLevel: 'error' },
  })
  try {
    await worker.ready
    const get = (path: string, headers: Record<string, string> = {}) =>
      worker.fetch(new URL(path, 'http://localhost').href, { headers, redirect: 'manual' })
    const listing = await get('/__fondu/prerender')
    if (!listing.ok) return fail([`the Worker did not list the pages (${listing.status})`])
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
      const visit = await get(path, { 'X-Inertia': 'true', ...(version && { 'X-Inertia-Version': version }) })
      if (doc.status !== 200 || visit.status !== 200) {
        const to = doc.headers.get('location')
        errors.push(`${path}: ${doc.status}${to ? ` → ${to}` : ''} (a prerendered page must answer 200 to anyone)`)
        continue
      }
      const page = (await visit.json()) as Record<string, unknown>
      const later = (['deferredProps', 'scrollProps'] as const).filter((key) => page[key])
      if (later.length) {
        errors.push(`${path}: ${later.join(', ')} ask the server again; not for a prerendered page`)
        continue
      }
      const headers = Object.fromEntries(
        [...doc.headers]
          .filter(([name]) => SECURITY_HEADERS.test(name))
          .map(([name, value]) => [name, /^content-security-policy/i.test(name) ? staticPolicy(value) : value]),
      )
      if (security && JSON.stringify(headers) !== JSON.stringify(security)) {
        errors.push(`${path}: its security headers differ from ${paths[0]}'s; one set is written for all`)
        continue
      }
      security = headers
      const files = staticFiles(path)
      write(clientDir, files.html, await doc.text())
      write(clientDir, files.json, JSON.stringify(page))
      logger.info(`fondu: prerendered ${path}`)
    }
    if (errors.length) return fail(errors)
    appendFileSync(join(clientDir, '_headers'), headerRules(security ?? {}))
  } finally {
    await worker.dispose()
  }
}

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
