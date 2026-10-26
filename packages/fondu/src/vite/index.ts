import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { builtinModules, createRequire } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

import devServer, { defaultOptions as devServerDefaults } from '@hono/vite-dev-server'
import react, { type Options as ReactOptions } from '@vitejs/plugin-react'
import {
  parseAst,
  transformWithOxc,
  type Plugin,
  type PluginOption,
  type ResolvedConfig,
  type UserConfig,
} from 'vite'

import type { ProgressOptions } from '../client/progress.js'
import { isPageFile, layoutsOf, pageId } from '../paths.js'
import { hmr, PAGE_EXPORTS, PROPS_EVENT } from './hmr.js'
import { nodeServer, prerender, worker } from './prerender.js'
import { stripRoutes, stripServerCode } from './strip.js'
import { typegen } from './typegen.js'
import { walk as walkFiles } from './typegen.js'

/**
 * `vite.config.ts`: `plugins: [fondu({ target: 'node' })]` (or `'bun'`; for Cloudflare: `cloudflare()` and
 * `fondu({ target: 'cloudflare' })`). Composes the packages that do the work:
 * - `@vitejs/plugin-react`
 * - Node / Bun: `@hono/vite-dev-server` (dev); the build is Vite's own, of two environments (`serverEntry()`)
 * - Cloudflare: `@cloudflare/vite-plugin` (yours: dev in workerd, the Worker's build)
 * and adds what none of them does: the app's entry (its pages and layouts, from `app/routes/`), the browser's copy of
 * a page's route file (its server code removed), the document's asset tags, the generated types, the server-only
 * guard. One `vite build` builds the client, then the server, then the pages to prerender.
 */
export interface FonduOptions {
  target: 'node' | 'bun' | 'cloudflare'
  /** production port (Node / Bun), default 3000 */
  port?: number
  /** `false`: pages render in the browser only, no server render is built (an admin app). Per route: `withoutSsr()` */
  ssr?: boolean
  react?: ReactOptions
  /**
   * Routes with `export const prerender` (or under a `_middleware.ts` with it) are written as static files at build
   * time, and navigations read them; the server (the Worker) answers the other pages
   */
  prerender?: boolean
  /** the bar at the top of the page while a navigation is on its way: its `delay` (ms) and `color`; `false`: none */
  progress?: ProgressOptions | false
}

/** what fondu's server code imports from Hono (test/hono.test.ts keeps the list complete) */
export const HONO = [
  'hono',
  'hono/combine',
  'hono/cookie',
  'hono/csrf',
  'hono/factory',
  'hono/http-exception',
  'hono/secure-headers',
  'hono/trailing-slash',
]
const SERVER = './app/server.ts'
const DEV_CSS = '/@fondu/dev.css'
const V = {
  /** the app's entry: the browser's, and the server render's */
  entry: 'virtual:fondu/entry',
  assets: 'virtual:fondu/assets',
  ssr: 'virtual:fondu/ssr',
  serverEntry: 'virtual:fondu/server-entry',
}
const resolved = (id: string) => '\0' + id

/** the pages, for the app's entry: the route files of `app/routes/` that are React, but what isn't a route */
const PAGES_GLOB = [
  '/app/routes/**/*.{tsx,jsx,mdx}',
  '!/app/routes/**/_*',
  '!/app/routes/**/_*/**',
  '!/app/routes/**/*.{test,spec}.{tsx,jsx}',
]
/** the error page (`_error.tsx`: a page, though its name says it is no URL) */
const ERROR_GLOB = '/app/routes/_error.{tsx,jsx}'
/** and the layouts (`_layout.tsx`): the client puts a page in those of its directories */
const LAYOUTS_GLOB = ['/app/routes/**/_layout.{tsx,jsx}', '!/app/routes/**/_*/**']

/**
 * For the dependency scan: a page's route file as the browser gets it, its server code removed. The scan would find
 * the server's dependencies otherwise, and bundle them for the browser.
 */
function scanRoutes(root: () => string): Plugin {
  return {
    name: 'fondu:scan-routes',
    load: {
      filter: { id: /\/app\/routes\/.*\.[jt]sx$/ },
      async handler(id) {
        const file = relative(`${root()}/app/routes`, id).split(sep).join('/')
        if (file.startsWith('..') || !isPageFile(file)) return
        const { code } = await transformWithOxc(readFileSync(id, 'utf8'), id, {
          lang: id.endsWith('.jsx') ? 'jsx' : 'tsx',
          jsx: { runtime: 'automatic' },
        })
        return {
          code: stripServerCode(code, parseAst(code) as never, file),
          moduleType: 'js',
        }
      },
    },
  }
}

/** For the dependency scan: an MDX page as the JavaScript @mdx-js/rollup makes of it (nothing without it) */
function scanMdx(config: () => ResolvedConfig): Plugin {
  return {
    name: 'fondu:scan-mdx',
    load: {
      filter: { id: /\.mdx$/ },
      async handler(id) {
        const hook = config().plugins.find((p) => p.name === '@mdx-js/rollup')?.transform
        const transform = typeof hook === 'function' ? hook : hook?.handler
        const out = await transform?.call(this as never, readFileSync(id, 'utf8'), id)
        return { code: typeof out === 'string' ? out : String(out?.code ?? ''), moduleType: 'js' }
      },
    },
  }
}

/**
 * The Worker never mounts or hydrates a page, but fondu/client imports `react-dom/client` (createRoot,
 * hydrateRoot) at its top: the whole of React's browser renderer in the Worker, evaluated at every start. There, it
 * is a module that says so if called (about a third of the Worker, and of its start in dev)
 */
const REACT_DOM_CLIENT = '\0fondu:react-dom-client'
function serverReactDomClient(): Plugin {
  return {
    name: 'fondu:server-react-dom-client',
    enforce: 'pre',
    applyToEnvironment: (env) => env.config.consumer === 'server',
    resolveId: { filter: { id: /^react-dom\/client$/ }, handler: () => REACT_DOM_CLIENT },
    load: {
      filter: { id: /^\0fondu:react-dom-client$/ },
      handler: () =>
        [
          `const browserOnly = (name) => () => { throw new Error('fondu: react-dom/client ' + name + '() runs in the browser, not in the server') }`,
          `export const createRoot = browserOnly('createRoot')`,
          `export const hydrateRoot = browserOnly('hydrateRoot')`,
          `export const version = ''`,
        ].join('\n'),
    },
  }
}

export default function fondu(options: FonduOptions): PluginOption[] {
  const node = options.target !== 'cloudflare'
  return [
    // .mdx too: MDX pages and components get Fast Refresh (as MDX's own docs set it up)
    react({ include: /\.(?:[jt]sx?|mdx)$/, ...options.react }),
    core(options),
    stripRoutes(),
    hmr(),
    loadFailure(),
    typegen(),
    ...(node ? runtimePlugins(options) : [serverReactDomClient()]),
  ]
}

/** the app's dependencies stay in node_modules, as with any Node server (native modules cannot be bundled) */
function dependencies(root = ''): string[] {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
  }
  return Object.keys(pkg.dependencies ?? {}).filter((d) => d !== 'fondu')
}

/**
 * Node / Bun: the server build's entry, dist/server/index.js. The client build's files first (found next to the
 * server bundle wherever it runs from; hashed files never change), then the app. Node: @hono/node-server's serve()
 * on `PORT` (else the option), saying where it listens, with a graceful shutdown on SIGTERM / SIGINT (10 s). Bun
 * serves the default export itself and reads `PORT` (with the app's `websocket`, if it has one).
 */
function serverEntry(options: FonduOptions): Plugin {
  let root = process.cwd()
  return {
    name: 'fondu:server-entry',
    apply: 'build',
    applyToEnvironment: (env) => env.name === 'ssr',
    configResolved(c) {
      root = c.root
    },
    resolveId: { filter: { id: /^virtual:fondu\/server-entry$/ }, handler: (id) => resolved(id) },
    load: {
      filter: { id: /^\0virtual:fondu\/server-entry$/ },
      handler() {
        const dir = resolve(root, 'dist/client')
        const paths = existsSync(dir)
          ? readdirSync(dir, { withFileTypes: true })
              .filter((e) => e.name !== '.vite')
              .map((e) => (e.isDirectory() ? `/${e.name}/*` : `/${e.name}`))
          : []
        const bun = options.target === 'bun'
        return [
          `import { Hono } from 'hono'`,
          `import { serveStatic } from '${bun ? 'hono/bun' : '@hono/node-server/serve-static'}'`,
          `import { fileURLToPath } from 'node:url'`,
          `import app from '${SERVER.slice(1)}'`,
          `const clientRoot = fileURLToPath(new URL('../client', import.meta.url))`,
          `const main = new Hono()`,
          `main.use('/assets/*', async (c, next) => { await next(); if (c.res.ok) c.header('Cache-Control', 'public, max-age=31536000, immutable') })`,
          ...paths.map((p) => `main.use(${JSON.stringify(p)}, serveStatic({ root: clientRoot }))`),
          // prerender: how the app reads the prerendered pages (fondu's server/prerender.ts)
          ...(options.prerender
            ? [
                `import { readFile } from 'node:fs/promises'`,
                `import { join as joinPath, sep } from 'node:path'`,
                `globalThis[Symbol.for('fondu.staticFiles')] = (file) => { const to = joinPath(clientRoot, file); return to.startsWith(clientRoot + sep) ? readFile(to).catch(() => null) : Promise.resolve(null) }`,
              ]
            : []),
          `main.all('*', (c) => app.fetch(c.req.raw, c.env))`,
          ...(bun
            ? [
                `export default app.websocket ? { fetch: main.fetch, websocket: app.websocket } : main`,
              ]
            : [
                `import { serve } from '@hono/node-server'`,
                `const server = serve({ fetch: main.fetch, port: Number(process.env.PORT) || ${options.port ?? 3000} }, (info) => console.log(\`Listening on http://localhost:\${info.port}\`))`,
                `const shutdown = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 10_000).unref() }`,
                `process.on('SIGINT', shutdown)`,
                `process.on('SIGTERM', shutdown)`,
                `export default main`,
              ]),
        ].join('\n')
      },
    },
  }
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
        const fromDevServer = createRequire(
          createRequire(import.meta.url).resolve('@hono/vite-dev-server'),
        )
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
    serverEntry(options),
  ]
}

/**
 * Dev: the app that fails to load (a route that throws as it is imported) is Vite's error page, which a navigation
 * can't show as a page: it loads the URL as a document instead (409), where Vite's overlay shows the error; the next
 * change reloads it.
 */
function loadFailure(): Plugin {
  let failed = false
  return {
    name: 'fondu:load-failure',
    apply: 'serve',
    configureServer(server) {
      // after the dev server (the Cloudflare plugin's too), before Vite's error page
      return () =>
        server.middlewares.use(
          (
            error: unknown,
            req: IncomingMessage,
            res: ServerResponse,
            next: (e: unknown) => void,
          ) => {
            const navigation = req.headers['x-fondu'] === 'true'
            // a page failed (not a module of the browser's): the next change reloads it
            if (navigation || req.headers.accept?.includes('text/html')) failed = true
            if (!navigation) return next(error)
            res.writeHead(409, {
              'X-Fondu-Location': (req as { originalUrl?: string }).originalUrl ?? req.url,
            })
            res.end()
          },
        )
    },
    hotUpdate() {
      if (this.environment.name !== 'client' || !failed) return
      failed = false
      this.environment.hot.send({ type: 'full-reload' })
    },
  }
}

function core(options: FonduOptions): Plugin {
  let config: ResolvedConfig
  let isBuild = false
  return {
    name: 'fondu',
    enforce: 'pre',
    config(user, env): UserConfig {
      isBuild = env.command === 'build'
      const client = { manifest: true, rollupOptions: { input: V.entry } }
      if (options.target === 'cloudflare') {
        return {
          environments: { client: { build: client } },
          // the worker reads the client manifest: client first
          builder: {
            async buildApp(builder) {
              const client = builder.environments.client!
              await builder.build(client)
              // the client manifest is for the build (asset tags, the version): not a static asset to deploy
              const ignore = resolve(config.root, client.config.build.outDir, '.assetsignore')
              if (existsSync(ignore)) appendFileSync(ignore, '.vite\n')
              for (const env of Object.values(builder.environments)) {
                // the Workers (@cloudflare/vite-plugin's environments, an input each), not Vite's own `ssr`, unused
                if (env.name === 'client' || !env.config.build.rolldownOptions?.input) continue
                await builder.build(env)
                const wrangler = resolve(config.root, env.config.build.outDir, 'wrangler.json')
                if (options.prerender && existsSync(wrangler)) {
                  const clientDir = resolve(config.root, client.config.build.outDir)
                  await prerender(worker(config.root, wrangler), clientDir, config.logger, true)
                }
              }
            },
          },
          ssr: { noExternal: ['fondu'] },
        }
      }
      // Node / Bun: the client into dist/client, then the server into dist/server (index.js: serverEntry()), then the
      // pages to prerender. The server bundles all but the app's dependencies, and is minified
      const target = options.target
      const external = isBuild ? dependencies(user.root) : []
      return {
        ssr: isBuild ? { noExternal: true, external, target: 'node' } : { noExternal: ['fondu'] },
        environments: {
          client: { build: { ...client, outDir: 'dist/client', emptyOutDir: true } },
          ssr: {
            build: {
              outDir: 'dist/server',
              emptyOutDir: true,
              copyPublicDir: false,
              minify: true,
              rollupOptions: {
                input: V.serverEntry,
                external: [
                  ...builtinModules,
                  /^node:/,
                  ...(target === 'bun' ? ['bun'] : []),
                  ...external,
                ],
                output: { entryFileNames: 'index.js', chunkFileNames: '[name]-[hash].js' },
              },
            },
          },
        },
        builder: {
          async buildApp(builder) {
            await builder.build(builder.environments.client!)
            await builder.build(builder.environments.ssr!)
            if (options.prerender)
              await prerender(
                nodeServer(config.root, target),
                resolve(config.root, 'dist/client'),
                config.logger,
                false,
              )
          },
        },
      }
    },
    // dev: the dependencies are found before the first request (Vite scans index.html by default; an app has none),
    // so the first page is not reloaded once they are optimized. The scan reads JavaScript: an MDX page is compiled
    // for it by the app's @mdx-js/rollup; the browser's, a page's route file without its server code
    configEnvironment(name, env) {
      const pages = ['app/routes/**/*.{tsx,jsx,mdx}']
      const mdx = { extensions: ['.mdx'], rolldownOptions: { plugins: [scanMdx(() => config)] } }
      if (name === 'client')
        return {
          optimizeDeps: {
            entries: pages,
            ...mdx,
            rolldownOptions: {
              plugins: [...mdx.rolldownOptions.plugins, scanRoutes(() => config.root)],
            },
          },
        }
      if (options.target !== 'cloudflare') return
      // the Worker: fondu is not pre-bundled (its routes import it back: a bundle would hand them a half-loaded
      // module), so the scan does not see what it imports (HONO, react, react-dom); nor react-dom/server, imported by
      // the server render (virtual:fondu/ssr). Found late, they would restart the Worker in the middle of requests.
      // The build is minified, as Workers start faster with less code to parse
      return {
        optimizeDeps: {
          exclude: ['fondu'],
          include: [
            ...HONO,
            'react',
            'react-dom',
            ...(options.ssr === false ? [] : ['react-dom/server']),
          ],
          entries: [SERVER.slice(2), 'app/routes/**/*.ts', ...pages],
          ...mdx,
          rolldownOptions: { plugins: [...mdx.rolldownOptions.plugins, serverReactDomClient()] },
        },
        ...(env.build?.minify === undefined && { build: { minify: true } }),
      }
    },
    configResolved(c) {
      config = c
    },
    // dev: the CSS the layouts import (the app's own: `import './styles/app.css'` in routes/_layout.tsx), as a
    // stylesheet in the document, so a server-rendered page is styled at first paint (Vite would add it only once the
    // JS runs); removed once the entry has run
    configureServer(server) {
      server.middlewares.use(DEV_CSS, async (_req, res) => {
        const env = server.environments.client
        const css: string[] = []
        try {
          const layouts = walkFiles(resolve(config.root, 'app/routes')).filter(
            (f) =>
              /(?:^|\/)_layout\.[jt]sx$/.test(f) &&
              !f
                .split('/')
                .slice(0, -1)
                .some((d) => d.startsWith('_')),
          )
          await Promise.all(layouts.map((f) => env.transformRequest(`/app/routes/${f}`)))
          const seen = new Set<string>()
          const walk = (
            mod: { id: string | null; url: string; importedModules: Set<typeof mod> } | undefined,
          ) => {
            if (!mod?.id || seen.has(mod.id)) return
            seen.add(mod.id)
            if (/\.(css|scss|sass|less|styl|pcss|postcss)(\?|$)/.test(mod.url)) css.push(mod.url)
            for (const m of mod.importedModules) walk(m)
          }
          for (const f of layouts)
            walk(env.moduleGraph.getModuleById(resolve(config.root, 'app/routes', f)) as never)
          const parts = await Promise.all(
            css.map(
              async (url) =>
                (await env.transformRequest(url + (url.includes('?') ? '&' : '?') + 'direct'))
                  ?.code ?? '',
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
    resolveId(id, importer) {
      if (id === V.entry || id === V.assets || id === V.ssr) return resolved(id)
      // the server-only guard, for fondu's own: `fondu` is the server's, `fondu/client` the browser's
      if (id === 'fondu' && importer && this.environment.config.consumer === 'client')
        this.error(
          `fondu: ${importer.replace(config.root, '')} imports 'fondu', server code that cannot be imported by browser code: the browser's is 'fondu/client'`,
        )
    },
    load(id) {
      // the app's entry, in the browser and for the server render: the pages and layouts, whether pages are
      // prerendered (navigations read their page objects from the static files), the progress bar; in dev, the
      // page's props asked for again when what its route depends on changed (hmr.ts)
      if (id === resolved(V.entry)) {
        const dev = this.environment.config.consumer === 'client' && !isBuild
        const settings = { prerender: Boolean(options.prerender), progress: options.progress ?? {} }
        // the browser loads a page's modules when it shows the page; the server has them already (createApp's)
        const server = this.environment.config.consumer === 'server'
        const glob = (pattern: string | string[]) =>
          server
            ? `lazy(import.meta.glob(${JSON.stringify(pattern)}, { eager: true }))`
            : `import.meta.glob(${JSON.stringify(pattern)})`
        return [
          `import { __entry${dev ? ', reload' : ''} } from 'fondu/client'`,
          ...(dev ? [`import.meta.hot?.on(${JSON.stringify(PROPS_EVENT)}, () => reload())`] : []),
          ...(server
            ? [
                `const lazy = (mods) => Object.fromEntries(Object.entries(mods).map(([k, m]) => [k, async () => m]))`,
              ]
            : []),
          `__entry({ ...${glob(PAGES_GLOB)}, ...${glob(ERROR_GLOB)} }, ${glob(LAYOUTS_GLOB)}, ${JSON.stringify(settings)})`,
        ].join('\n')
      }
      // and React's static markup for a JSX document (react-dom/server: the server render's, or loaded for it)
      if (id === resolved(V.ssr))
        return options.ssr === false
          ? `export const renderPage = null\nexport const renderMarkup = async (el) => (await import('react-dom/server')).renderToStaticMarkup(el)`
          : [
              `import '${V.entry}'`,
              `import { renderToString, renderToStaticMarkup } from 'react-dom/server'`,
              `import { renderPage as render } from 'fondu/client'`,
              `export const renderPage = (page) => render(page, renderToString)`,
              `export { renderToStaticMarkup as renderMarkup }`,
            ].join('\n')
      if (id === resolved(V.assets))
        return (
          (isBuild ? productionAssets(config, options) : devAssets(config.base)) +
          `\nexport const prerender = ${Boolean(options.prerender)}`
        )
      // the server-only guard: browser code must never import server code
      if (this.environment.config.consumer === 'client' && isServerOnly(id, config.root)) {
        this.error(
          `fondu: ${id.replace(config.root, '')} is server code (routes/*.ts, server.ts, *.server.ts) and cannot be imported by browser code`,
        )
      }
    },
  }
}

/**
 * `*.server.ts`, or the app's `server.ts` and the `.ts` files of `routes/` (the root's: a path above it or in a package
 * may have them). A page's route file (`.tsx`) reaches the browser without its server code (strip.ts).
 */
const isServerOnly = (id: string, root: string) => {
  const file = id.split('?')[0]!
  return (
    /\.server\.[cm]?[jt]sx?$/.test(file) ||
    (file.startsWith(`${root}/app/routes/`) && file.endsWith('.ts')) ||
    file === `${root}/app/server.ts`
  )
}

const nonceAttr = `\${nonce ? \` nonce="\${nonce}"\` : ''}`

function devAssets(base: string): string {
  const preamble = `import RefreshRuntime from "${base}@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;window.__vite_plugin_react_preamble_installed__=true;window.__getReactRefreshIgnoredExports=({id})=>window.${PAGE_EXPORTS}?.[id]??[]`
  return `export const version = null
export function assetTags(_component, nonce) {
  return '<link rel="stylesheet" href="${base}${DEV_CSS.slice(1)}" data-fondu-dev-css>'
    + \`<script type="module"${nonceAttr}>${preamble}</script><script type="module" src="${base}@vite/client"${nonceAttr}></script><script type="module" src="${base}@id/__x00__${V.entry}"${nonceAttr}></script><script type="module"${nonceAttr}>document.querySelector('[data-fondu-dev-css]')?.remove()</script>\`
}`
}

interface ManifestChunk {
  file: string
  isEntry?: boolean
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
      `fondu: the client manifest (${file}) is missing: the client is built first (\`vite build\`)`,
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
  // the app's entry: the client build's only one
  const entry = tags(Object.keys(manifest).find((k) => manifest[k]!.isEntry)!)
  const pages: Record<string, { css: string[]; js: string[] }> = {}
  for (const key of Object.keys(manifest)) {
    const file = key.startsWith('app/routes/') ? key.slice('app/routes/'.length) : undefined
    if (!file || !(isPageFile(file) || /^_error\.[jt]sx$/.test(file))) continue
    // the page's chunk, and its layouts' (loaded with it)
    const around = layoutsOf(file)
      .flatMap((dir) =>
        ['tsx', 'jsx'].map((ext) => `app/routes/${dir ? `${dir}/` : ''}_layout.${ext}`),
      )
      .filter((k) => k in manifest)
    const all = [...around, key].map(tags)
    pages[pageId(file)] = { css: all.flatMap((t) => t.css), js: all.flatMap((t) => t.js) }
  }
  const version = createHash('sha256').update(text).digest('hex').slice(0, 16)
  return `const base = ${JSON.stringify(config.base)}
const entry = ${JSON.stringify(entry)}
const byPage = ${JSON.stringify(pages)}
export const version = ${JSON.stringify(version)}
export function assetTags(component, nonce) {
  const page = byPage[component] ?? { css: [], js: [] }
  const css = [...new Set([...entry.css, ...page.css])]
  const [main, ...preload] = new Set([...entry.js, ...page.js])
  return css.map((f) => \`<link rel="stylesheet" href="\${base}\${f}">\`).join('')
    + preload.map((f) => \`<link rel="modulepreload" href="\${base}\${f}"${nonceAttr}>\`).join('')
    + \`<script type="module" src="\${base}\${main}"${nonceAttr}></script>\`
}`
}
