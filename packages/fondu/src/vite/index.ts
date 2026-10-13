import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import devServer, { defaultOptions as devServerDefaults } from '@hono/vite-dev-server'
import inertia from '@inertiajs/vite'
import react, { type Options as ReactOptions } from '@vitejs/plugin-react'
import type { Plugin, PluginOption, ResolvedConfig } from 'vite'

import { prerender } from './prerender.js'
import { typegen } from './typegen.js'

/**
 * `vite.config.ts`: `plugins: [fondu({ target: 'node' })]` (or `'bun'`; for Cloudflare: `cloudflare()` and
 * `fondu({ target: 'cloudflare' })`). Composes the packages that do the work:
 * - `@vitejs/plugin-react`, and `@inertiajs/vite` (pages from `app/pages/`, the server render of `app/app.tsx`)
 * - Node / Bun: `@hono/vite-dev-server` (dev) and `@hono/vite-build` (`vite build --mode client && vite build`)
 * - Cloudflare: `@cloudflare/vite-plugin` (yours: dev in workerd, one `vite build`)
 * and adds what none of them does: the document's asset tags, the generated types, the server-only guard.
 */
export interface FonduOptions {
  target: 'node' | 'bun' | 'cloudflare'
  /** production port (Node / Bun), default 3000 */
  port?: number
  /** `false`: pages render in the browser only, no server render is built (an admin app). Per route: `withoutSsr()` */
  ssr?: boolean
  react?: ReactOptions
  /**
   * Cloudflare: routes with `export const prerender` (or under a `_middleware.ts` with it) are written as static
   * files at build time, and visits read them; the Worker answers the other pages
   */
  prerender?: boolean
}

const ENTRY = 'app/app.tsx'
const SERVER = './app/server.ts'
const DEV_CSS = '/@fondu/dev.css'
const V = { assets: 'virtual:fondu/assets', ssr: 'virtual:fondu/ssr' }
const resolved = (id: string) => '\0' + id

/**
 * `@inertiajs/vite` wraps `createInertiaApp(...)` for the server; its React template also starts a standalone
 * SSR server (Laravel's model). Same wrap, rendering in this process: the template only exports the render.
 */
const inertiaInProcess = {
  package: '@inertiajs/react',
  extensions: ['.tsx', '.jsx'],
  extractDefault: true,
  ssr: (configureCall: string) => `
import { renderToString } from 'react-dom/server'
const renderPromise = ${configureCall}
renderPromise.catch((error) => console.error(error))
export default async function renderPage(page) {
  return (await renderPromise)(page, renderToString)
}
`,
}

export default function fondu(options: FonduOptions): PluginOption[] {
  const node = options.target !== 'cloudflare'
  if (options.prerender && node)
    throw new Error('fondu: `prerender` is for the Cloudflare target only, so far (github.com/fondujs/fondu/issues/6)')
  return [
    react(options.react),
    // `ssr: {}`: the server transform without an entry, so without @inertiajs/vite's dev SSR endpoint (Laravel's model)
    inertia({ ssr: options.ssr === false ? false : {}, frameworks: inertiaInProcess }),
    core(options),
    typegen(),
    ...(node ? runtimePlugins(options) : []),
  ]
}

async function buildPlugin(options: FonduOptions): Promise<Plugin> {
  const { default: build } =
    options.target === 'bun' ? await import('@hono/vite-build/bun') : await import('@hono/vite-build/node')
  // the app's dependencies stay in node_modules (as with any Node server: native modules cannot be bundled)
  const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { dependencies?: Record<string, string> }
  const external = Object.keys(pkg.dependencies ?? {}).filter((d) => d !== 'fondu')
  const plugin = build({
    entry: SERVER,
    external,
    outputDir: './dist',
    // Node: @hono/node-server's serve() on `PORT` (else the option), saying where it listens, with a graceful
    // shutdown on SIGTERM / SIGINT (10 s). Bun serves the default export itself and reads `PORT`.
    ...(options.target === 'node' && {
      entryContentAfterHooks: [
        (app: string) =>
          [
            `import { serve } from '@hono/node-server'`,
            `const server = serve({ fetch: ${app}.fetch, port: Number(process.env.PORT) || ${options.port ?? 3000} }, (info) => console.log(\`Listening on http://localhost:\${info.port}\`))`,
            `const shutdown = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 10_000).unref() }`,
            `process.on('SIGINT', shutdown)`,
            `process.on('SIGTERM', shutdown)`,
          ].join('\n'),
      ],
    }),
    // the client build's files (dist/client), found next to the server bundle wherever it runs from; hashed files
    // never change
    entryContentBeforeHooks: [
      (app: string) => {
        const dir = resolve('dist/client') // vite runs in the project root
        const paths = existsSync(dir)
          ? readdirSync(dir, { withFileTypes: true })
              .filter((e) => e.name !== '.vite')
              .map((e) => (e.isDirectory() ? `/${e.name}/*` : `/${e.name}`))
          : []
        return [
          `import { serveStatic } from '${options.target === 'bun' ? 'hono/bun' : '@hono/node-server/serve-static'}'`,
          `import { fileURLToPath } from 'node:url'`,
          `const clientRoot = fileURLToPath(new URL('./client', import.meta.url))`,
          `${app}.use('/assets/*', async (c, next) => { await next(); if (c.res.ok) c.header('Cache-Control', 'public, max-age=31536000, immutable') })`,
          ...paths.map((p) => `${app}.use(${JSON.stringify(p)}, serveStatic({ root: clientRoot }))`),
        ].join('\n')
      },
    ],
  } as never) as Plugin
  return plugin
}

function runtimePlugins(options: FonduOptions): PluginOption[] {
  return [
    {
      // dev: the same Request / Response globals as the production server (@hono/node-server's), which the dev
      // server's requests are made with: middleware that re-creates the request (hono/body-limit) needs them
      name: 'fondu:node-globals',
      apply: 'serve',
      async configureServer() {
        // the dev server's own copy, as an ES module (its CommonJS build would be another class)
        const fromDevServer = createRequire(createRequire(import.meta.url).resolve('@hono/vite-dev-server'))
        const dir = dirname(dirname(fromDevServer.resolve('@hono/node-server'))) // …/dist/index.js
        const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
          exports: { '.': { import: string | { default: string } } }
        }
        const entry = pkg.exports['.'].import
        const { getRequestListener } = (await import(
          pathToFileURL(join(dir, typeof entry === 'string' ? entry : entry.default)).href
        )) as { getRequestListener: (fetch: () => Response) => unknown }
        getRequestListener(() => new Response())
      },
    },
    devServer({
      entry: SERVER,
      injectClientScript: false, // the document has the client tags (with the React refresh preamble)
      adapter: undefined,
      exclude: devServerDefaults.exclude,
      handleHotUpdate: () => {}, // fondu's plugin does it, for every target
    }),
    buildPlugin(options),
  ]
}

function core(options: FonduOptions): Plugin {
  let config: ResolvedConfig
  let isBuild = false
  return {
    name: 'fondu',
    enforce: 'pre',
    config(_user, env) {
      isBuild = env.command === 'build'
      const client = { manifest: true, rollupOptions: { input: ENTRY } }
      if (options.target === 'cloudflare') {
        return {
          environments: { client: { build: client } },
          // the worker reads the client manifest: client first
          builder: {
            async buildApp(builder) {
              const client = builder.environments.client!
              await builder.build(client)
              for (const env of Object.values(builder.environments)) {
                if (env.name === 'client') continue
                await builder.build(env)
                const worker = resolve(config.root, env.config.build.outDir, 'wrangler.json')
                if (options.prerender && existsSync(worker))
                  await prerender(config.root, worker, resolve(config.root, client.config.build.outDir), config.logger)
              }
            },
          },
          ssr: { noExternal: ['fondu'] },
        }
      }
      // Node / Bun: `vite build --mode client` builds the client into dist/client, `vite build` the server
      return env.mode === 'client'
        ? { build: { ...client, outDir: 'dist/client', emptyOutDir: true } }
        : {
            ssr: { noExternal: ['fondu'] },
            build: { copyPublicDir: false, rollupOptions: { output: { chunkFileNames: 'server/[name]-[hash].js' } } },
          }
    },
    // dev: the dependencies are found before the first request (Vite scans index.html by default; an app has none),
    // so the first page is not reloaded once they are optimized
    configEnvironment(name, env) {
      const pages = ['app/pages/**/*.tsx', 'app/pages/**/*.jsx']
      if (name === 'client') return { optimizeDeps: { entries: [ENTRY, ...pages] } }
      if (options.target !== 'cloudflare') return
      // the Worker: fondu is not pre-bundled (its routes import it back: a bundle would hand them a half-loaded
      // module); react-dom/server is imported by @inertiajs/vite's generated render, which the scan does not see.
      // The build is minified, as Workers start faster with less code to parse
      return {
        optimizeDeps: {
          exclude: ['fondu'],
          include: options.ssr === false ? [] : ['react-dom/server'],
          entries: [SERVER.slice(2), 'app/routes/**/*.ts', ENTRY, ...pages],
        },
        ...(env.build?.minify === undefined && { build: { minify: true } }),
      }
    },
    configResolved(c) {
      config = c
    },
    // dev: server code changed (a module of the server only: routes/, *.server.ts…): reload the page; a page component:
    // React Fast Refresh (the client's HMR)
    handleHotUpdate({ server, file }) {
      const modules = (env: string) => [...(server.environments[env]?.moduleGraph.getModulesByFile(file) ?? [])]
      // the browser's code (not a file a stylesheet only watches, as Tailwind's sources), or no server's: leave it
      if (modules('client').some((m) => m.type === 'js')) return
      if (!Object.keys(server.environments).some((env) => env !== 'client' && modules(env).length)) return
      server.hot.send({ type: 'full-reload' })
      return []
    },
    // dev: the CSS the client entry imports, as a stylesheet in the document, so a server-rendered page is styled
    // at first paint (Vite would add it only once the JS runs); removed once the entry has run
    configureServer(server) {
      server.middlewares.use(DEV_CSS, async (_req, res) => {
        const env = server.environments.client
        const css: string[] = []
        try {
          await env.transformRequest('/' + ENTRY)
          const seen = new Set<string>()
          const walk = (mod: { id: string | null; url: string; importedModules: Set<typeof mod> } | undefined) => {
            if (!mod?.id || seen.has(mod.id)) return
            seen.add(mod.id)
            if (/\.(css|scss|sass|less|styl|pcss|postcss)(\?|$)/.test(mod.url)) css.push(mod.url)
            for (const m of mod.importedModules) walk(m)
          }
          walk(env.moduleGraph.getModuleById(resolve(config.root, ENTRY)) as never)
          const parts = await Promise.all(
            css.map(
              async (url) => (await env.transformRequest(url + (url.includes('?') ? '&' : '?') + 'direct'))?.code ?? '',
            ),
          )
          res.setHeader('Content-Type', 'text/css')
          res.end(parts.join('\n'))
        } catch (error) {
          res.statusCode = 500
          res.end(`/* ${String(error)} */`)
        }
      })
    },
    // Cloudflare: Workers Static Assets serve the client build; hashed files never change (unless you wrote your own
    // public/_headers)
    generateBundle() {
      if (
        options.target !== 'cloudflare' ||
        this.environment.name !== 'client' ||
        existsSync(resolve(config.publicDir, '_headers'))
      )
        return
      this.emitFile({
        type: 'asset',
        fileName: '_headers',
        source: '/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n',
      })
    },
    resolveId(id) {
      if (id === V.assets || id === V.ssr) return resolved(id)
    },
    // prerender: the client entry reads page objects from the prerendered files (fondu/client's `prerendered`)
    transform(code, id) {
      if (!options.prerender || this.environment.config.consumer !== 'client' || id !== resolve(config.root, ENTRY))
        return
      return { code: `import { prerendered } from 'fondu/client';prerendered();${code}`, map: null }
    },
    load(id) {
      if (id === resolved(V.ssr))
        return options.ssr === false
          ? 'export const renderPage = null'
          : `export { default as renderPage } from '/${ENTRY}'`
      if (id === resolved(V.assets))
        return (
          (isBuild ? productionAssets(config, options) : devAssets(config.base)) +
          `\nexport const prerender = ${Boolean(options.prerender)}`
        )
      // the server-only guard: browser code must never import server code
      if (this.environment.config.consumer === 'client' && isServerOnly(id)) {
        this.error(
          `fondu: ${id.replace(config.root, '')} is server code (routes/, server.ts, *.server.ts) and cannot be imported by browser code`,
        )
      }
    },
  }
}

const isServerOnly = (id: string) =>
  /\.server\.[cm]?[jt]sx?(\?.*)?$/.test(id) || /\/app\/(routes\/|server\.ts)/.test(id)

const nonceAttr = `\${nonce ? \` nonce="\${nonce}"\` : ''}`

function devAssets(base: string): string {
  const preamble = `import RefreshRuntime from "${base}@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;window.__vite_plugin_react_preamble_installed__=true`
  return `export const version = null
export const pages = null
export function assetTags(_component, nonce) {
  return '<link rel="stylesheet" href="${base}${DEV_CSS.slice(1)}" data-fondu-dev-css>'
    + \`<script type="module"${nonceAttr}>${preamble}</script><script type="module" src="${base}@vite/client"${nonceAttr}></script><script type="module" src="${base}${ENTRY}"${nonceAttr}></script><script type="module"${nonceAttr}>document.querySelector('[data-fondu-dev-css]')?.remove()</script>\`
}`
}

interface ManifestChunk {
  file: string
  css?: string[]
  imports?: string[]
}

function productionAssets(config: ResolvedConfig, options: FonduOptions): string {
  const outDir =
    options.target === 'cloudflare'
      ? resolve(config.root, config.environments.client?.build.outDir ?? 'dist/client')
      : resolve(config.root, 'dist/client')
  const file = resolve(outDir, '.vite/manifest.json')
  if (!existsSync(file))
    throw new Error(
      `fondu: the client manifest (${file}) is missing: build the client first (\`vite build --mode client\`)`,
    )
  const text = readFileSync(file, 'utf8')
  const manifest = JSON.parse(text) as Record<string, ManifestChunk>
  const collect = (key: string, css: Set<string>, js: Set<string>, seen = new Set<string>()) => {
    const chunk = manifest[key]
    if (!chunk || seen.has(key)) return
    seen.add(key)
    js.add(chunk.file)
    for (const c of chunk.css ?? []) css.add(c)
    for (const i of chunk.imports ?? []) collect(i, css, js, seen)
  }
  const tags = (key: string) => {
    const css = new Set<string>(),
      js = new Set<string>()
    collect(key, css, js)
    return { css: [...css], js: [...js] }
  }
  const entry = tags(ENTRY)
  const pages: Record<string, { css: string[]; js: string[] }> = {}
  for (const key of Object.keys(manifest)) {
    const m = key.match(/^app\/pages\/(.+)\.[jt]sx$/)
    if (m) pages[m[1]!] = tags(key)
  }
  const version = createHash('sha256').update(text).digest('hex').slice(0, 16)
  return `const base = ${JSON.stringify(config.base)}
const entry = ${JSON.stringify(entry)}
const byPage = ${JSON.stringify(pages)}
export const version = ${JSON.stringify(version)}
export const pages = ${JSON.stringify(Object.keys(pages))}
export function assetTags(component, nonce) {
  const page = byPage[component] ?? { css: [], js: [] }
  const css = [...new Set([...entry.css, ...page.css])]
  const [main, ...preload] = new Set([...entry.js, ...page.js])
  return css.map((f) => \`<link rel="stylesheet" href="\${base}\${f}">\`).join('')
    + preload.map((f) => \`<link rel="modulepreload" href="\${base}\${f}"${nonceAttr}>\`).join('')
    + \`<script type="module" src="\${base}\${main}"${nonceAttr}></script>\`
}`
}
