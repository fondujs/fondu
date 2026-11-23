import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { builtinModules } from 'node:module'
import { relative, resolve, sep } from 'node:path'

import devServer, { defaultOptions as devServerDefaults } from '@hono/vite-dev-server'
import react, { type Options as ReactOptions } from '@vitejs/plugin-react'
import {
  isCSSRequest,
  loadEnv,
  parseAst,
  transformWithOxc,
  type Plugin,
  type PluginOption,
  type ResolvedConfig,
  type UserConfig,
} from 'vite'

import type { ProgressOptions } from '../client/progress.js'

export type { ProgressOptions }
import { isPageFile, pageId } from '../paths.js'
import { nonceAttr, productionAssets } from './assets.js'
import { checkRoutes } from './check.js'
import { entryCode, SERVER } from './entry.js'
import { hmr, PAGE_EXPORTS, PROPS_EVENT } from './hmr.js'
import { HONO } from './hono.js'
import { fonduInstalled } from './installed.js'
import { layoutChains, VIEW_QUERY } from './layouts.js'
import { devServerNodeServer } from './node-server.js'
import { checkOptions } from './options.js'
import { nodeServer, prerender, worker } from './prerender.js'
import { stripRoutes, stripServerCode } from './strip.js'
import { typegen, walk as walkFiles } from './typegen.js'

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
  /** `false`: pages render in the browser only, no server render is built (an admin app). Per route: `withoutSsr()` */
  ssr?: boolean
  react?: ReactOptions
  /**
   * Routes with `export const prerender` (or under a `_middleware.ts` with it) are written as static files at build
   * time, and navigations read them; the server (the Worker) answers the other pages
   */
  prerender?: boolean
  /**
   * the bar at the top of the page while a navigation is on its way: its `delay` (ms), its `color`, and whether forms'
   * submissions show it (`forms`); `false`: none
   */
  progress?: ProgressOptions | false
  /**
   * `true`: every navigation runs inside the browser's `document.startViewTransition`, typed `navigation-forward`,
   * `navigation-back` or `navigation-replace`; the app styles them in CSS. A link or a call opts out
   * (`data-transition="false"`, `transition: false`). Off by default: a navigation then opts in on its own
   * (`data-transition`, `navigate(href, { transition: true })`)
   */
  viewTransitions?: boolean
}

const DEV_CSS = '/@fondu/dev.css'
const V = {
  /** the app's entry: the browser's, and the server render's */
  entry: 'virtual:fondu/entry',
  assets: 'virtual:fondu/assets',
  ssr: 'virtual:fondu/ssr',
  serverEntry: 'virtual:fondu/server-entry',
}
/** fondu's own `server/static.js`, imported by the built server's entry (by its path: it is not an export of the package) */
const resolved = (id: string) => '\0' + id

/** the pages, for the app's entry: the route files of `app/routes/` that are React, but what isn't a route */
const PAGES_GLOB = [
  '/app/routes/**/*.{tsx,mdx}',
  '!/app/routes/**/_*',
  '!/app/routes/**/_*/**',
  '!/app/routes/**/*.{test,spec}.*',
]
/** the error page (`_error.tsx`: a page, though its name says it is no URL) */
const ERROR_GLOB = '/app/routes/_error.tsx'

/**
 * For the dependency scan: a page's route file as the browser gets it, its server code removed. The scan would find
 * the server's dependencies otherwise, and bundle them for the browser.
 */
function scanRoutes(root: () => string): Plugin {
  return {
    name: 'fondu:scan-routes',
    load: {
      filter: { id: /\/app\/routes\/.*\.tsx$/ },
      async handler(id) {
        const file = relative(`${root()}/app/routes`, id).split(sep).join('/')
        if (file.startsWith('..') || !isPageFile(file)) return
        const source = readFileSync(id, 'utf8')
        const stripped = stripServerCode(source, parseAst(source, { lang: 'tsx' }) as never, file)
        const { code } = await transformWithOxc(stripped, id, {
          lang: 'tsx',
          jsx: { runtime: 'automatic' },
        })
        return { code, moduleType: 'js' }
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
 * The server never mounts or hydrates a page (it renders with react-dom/server), but fondu/client imports
 * `react-dom/client` (createRoot, hydrateRoot) at its top: the whole of React's browser renderer, loaded at every
 * start (about a third of a Worker, and of its start in dev; about 59 ms of a Node server's). On every target, it is
 * a module that says so if called
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
  checkOptions(options)
  const node = options.target !== 'cloudflare'
  return [
    // .mdx too: MDX pages and components get Fast Refresh (as MDX's own docs set it up)
    react({ include: /\.(?:[jt]sx?|mdx)$/, ...options.react }),
    core(options),
    layoutChains(),
    stripRoutes(),
    hmr(),
    loadFailure(),
    typegen(),
    checkRoutes(),
    ...(node ? runtimePlugins(options) : []),
    serverReactDomClient(),
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
 * on `PORT` (else 3000), saying where it listens, with a graceful shutdown on SIGTERM / SIGINT (10 s). Bun
 * serves the default export itself, on `PORT` (Bun reads it, else 3000), with the app's
 * `websocket`, if it has one.
 * With `prerender`, the pages the build wrote are served from their files first, with the headers it decided
 * (`prerender.json`, next to this entry).
 */
function serverEntry(options: FonduOptions): Plugin {
  let root = process.cwd()
  let assetsDir = 'assets'
  return {
    name: 'fondu:server-entry',
    apply: 'build',
    applyToEnvironment: (env) => env.name === 'ssr',
    configResolved(c) {
      root = c.root
      assetsDir = c.environments.client?.build.assetsDir ?? c.build.assetsDir
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
        return entryCode(options, paths, assetsDir)
      },
    },
  }
}

function runtimePlugins(options: FonduOptions): PluginOption[] {
  return [
    {
      // dev: the app's .env files (in Vite's `envDir`: `.env`, `.env.local`, `.env.[mode]`, `.env.[mode].local`) are in `process.env`, as the
      // server code reads them; a variable set already (the shell's, the host's) stays. Vite loads them for
      // `import.meta.env` only, and for the `VITE_` ones. Cloudflare has its own, `.dev.vars`. The production server
      // reads them itself (the template's `start` script)
      name: 'fondu:env',
      apply: 'serve',
      configResolved(config) {
        for (const [key, value] of Object.entries(loadEnv(config.mode, config.envDir, '')))
          process.env[key] ??= value
      },
    },
    {
      // dev: the same Request / Response globals as the production server (@hono/node-server's), which the dev
      // server's requests are made with: middleware that re-creates the request (hono/body-limit) needs them
      name: 'fondu:node-globals',
      apply: 'serve',
      async configureServer() {
        const { getRequestListener } = await devServerNodeServer()
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
      const client = {
        manifest: true,
        rolldownOptions: {
          input: V.entry,
          // a page's or a layout's chunk named after its route file: (site)/users/[id].tsx is site-users-id
          output: {
            chunkFileNames: (chunk: { facadeModuleId: string | null }) => {
              const file = chunk.facadeModuleId?.split('?')[0]
              const routes = `${config.root}/app/routes/`
              const name = file?.startsWith(routes)
                ? pageId(file.slice(routes.length))
                    .replace(/[^a-zA-Z0-9]+/g, '-')
                    .replace(/^-|-$/g, '')
                : undefined
              return `${config.environments.client?.build.assetsDir ?? config.build.assetsDir}/${name || '[name]'}-[hash].js`
            },
          },
        },
      }
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
                  await prerender(worker(config.root, wrangler), clientDir, config.logger, {
                    headersFile: true,
                  })
                  workerFirstForIndex(wrangler)
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
              rolldownOptions: {
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
                { serverDir: resolve(config.root, 'dist/server') },
              )
          },
        },
      }
    },
    // dev: the dependencies are found before the first request (Vite scans index.html by default; an app has none),
    // so the first page is not reloaded once they are optimized. The scan reads JavaScript: an MDX page is compiled
    // for it by the app's @mdx-js/rollup; the browser's, a page's route file without its server code
    configEnvironment(name, env) {
      const pages = ['app/routes/**/*.{tsx,mdx}']
      const mdx = { extensions: ['.mdx'], rolldownOptions: { plugins: [scanMdx(() => config)] } }
      if (name === 'client')
        return {
          optimizeDeps: {
            entries: pages,
            // the app's entry (virtual:fondu/entry, not scanned) imports fondu/client/internal: both are pre-bundled in
            // the one run, so they share the one module of the client (one React context, one navigation state).
            // Only for an installed fondu: a linked one (the workspace's) stays as Vite treats linked packages
            ...(fonduInstalled() && { include: ['fondu/client', 'fondu/client/internal'] }),
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
    // JS runs); removed by fondu/client once the page's modules (its layouts: their CSS) are loaded
    configureServer(server) {
      server.middlewares.use(`${config.base}${DEV_CSS.slice(1)}`, async (req, res) => {
        const env = server.environments.client
        const css: string[] = []
        try {
          const component = new URL(req.url ?? '/', 'http://localhost').searchParams.get('page')
          const file = walkFiles(resolve(config.root, 'app/routes')).find(
            (f) => (isPageFile(f) || f === '_error.tsx') && pageId(f) === component,
          )
          const seen = new Set<string>()
          async function visit(servedUrl: string) {
            // Undo Vite's browser ID encoding, as its transform middleware does.
            const url = servedUrl
              .replace(/^\/@id\/(?:__x00__)?/, (prefix) => (prefix.endsWith('__x00__') ? '\0' : ''))
              .replace(/([?&])import(?=&|$)&?/, '$1')
              .replace(/([?&])t=\d+(?=&|$)&?/, '$1')
              .replace(/[?&]$/, '')
            if (seen.has(url) || /[?&](?:inline|raw|url|worker|sharedworker)(?:[&=]|$)/.test(url))
              return
            seen.add(url)
            if (isCSSRequest(url)) {
              css.push(url)
              return
            }
            if (
              url.startsWith('/@vite/') ||
              url === '__vite-browser-external' ||
              url.startsWith('__vite-browser-external:') ||
              env.depsOptimizer?.isOptimizedDepUrl(url)
            )
              return
            const result = await env.transformRequest(url)
            if (!result) return
            // Vite rewrites import and re-export sources to served URLs. The module graph also contains dynamic imports.
            for (const n of parseAst(result.code).body) {
              if (
                n.type !== 'ImportDeclaration' &&
                n.type !== 'ExportNamedDeclaration' &&
                n.type !== 'ExportAllDeclaration'
              )
                continue
              const dep = n.source?.value
              if (dep?.startsWith(config.base) && !dep.startsWith('//'))
                await visit('/' + dep.slice(config.base.length))
            }
          }
          if (file) await visit('/app/routes/' + file + VIEW_QUERY)
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
        source: `/${this.environment.config.build.assetsDir}/*\n  Cache-Control: public, max-age=31536000, immutable\n`,
      })
    },
    // the server render loads a page through the entry's import(), of a module createApp has imported already: in
    // the server's bundle, as it should be
    onLog(_level, log) {
      if (log.code === 'INEFFECTIVE_DYNAMIC_IMPORT' && log.message.includes('virtual:fondu/entry'))
        return false
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
      // prerendered (navigations read their page objects from the static files), the progress bar, whether navigations
      // transition by default; in dev, the page's props asked for again when what its route depends on changed (hmr.ts)
      if (id === resolved(V.entry)) {
        const dev = this.environment.config.consumer === 'client' && !isBuild
        const settings = {
          prerender: Boolean(options.prerender),
          progress: options.progress ?? {},
          viewTransitions: Boolean(options.viewTransitions),
        }
        const glob = (pattern: string | string[], view = true) =>
          `import.meta.glob(${JSON.stringify(pattern)}${view ? `, {query:${JSON.stringify(VIEW_QUERY)}}` : ''})`
        return [
          `import { __entry } from 'fondu/client/internal'`,
          ...(dev ? [`import { reload } from 'fondu/client'`] : []),
          ...(dev ? [`import.meta.hot?.on(${JSON.stringify(PROPS_EVENT)}, () => reload())`] : []),
          `__entry({ ...${glob(PAGES_GLOB)}, ...${glob(ERROR_GLOB)} }, ${JSON.stringify(settings)}, ${glob(ERROR_GLOB, false)}[${JSON.stringify(ERROR_GLOB)}])`,
        ].join('\n')
      }
      // and React's static markup for a JSX document (react-dom/server: the server render's, or loaded for it)
      if (id === resolved(V.ssr))
        return options.ssr === false
          ? `export const renderPage = null\nexport const renderMarkup = async (el) => (await import('react-dom/server')).renderToStaticMarkup(el)`
          : [
              `import '${V.entry}'`,
              `import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server'`,
              `import { renderPage as render } from 'fondu/client/internal'`,
              `export const renderPage = (page, options) => render(page, (el) => renderToReadableStream(el, options))`,
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
      // and a page's route file as it is (`?raw`, `?url`…): the browser's copy is the page alone
      const [file, query] = id.split('?')
      if (
        this.environment.config.consumer === 'client' &&
        query &&
        file!.startsWith(`${config.root}/app/routes/`) &&
        isPageFile(file!.slice(`${config.root}/app/routes/`.length)) &&
        /(?:^|&)(?:raw|url|inline)(?:&|=|$)/.test(query)
      )
        this.error(
          `fondu: ${file!.replace(config.root, '')} has server code: only its page reaches the browser`,
        )
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

/**
 * The built Worker's config: URLs ending in index go to the Worker first. Static assets would answer them with the
 * page of their directory (`/docs/index` → `docs/index.html`, redirected to `/docs/`), while a route (a param's value)
 * may be theirs. Added to the app's own `run_worker_first`, unless it is `true` (every request first) already.
 */
function workerFirstForIndex(file: string) {
  const config = JSON.parse(readFileSync(file, 'utf8')) as {
    assets?: { run_worker_first?: boolean | string[] }
  }
  const assets = (config.assets ??= {})
  if (assets.run_worker_first === true) return
  const own = Array.isArray(assets.run_worker_first) ? assets.run_worker_first : []
  assets.run_worker_first = [...new Set([...own, '/index', '/*/index'])]
  writeFileSync(file, JSON.stringify(config))
}

function devAssets(base: string): string {
  const preamble = `import RefreshRuntime from "${base}@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;window.__vite_plugin_react_preamble_installed__=true;window.__getReactRefreshIgnoredExports=({id})=>window.${PAGE_EXPORTS}?.[id]??[]`
  return `export const version = null
export function assetTags(component, nonce) {
  return '<link rel="stylesheet" href="${base}${DEV_CSS.slice(1)}?page=' + encodeURIComponent(component) + '" data-fondu-dev-css>'
    + \`<script type="module"${nonceAttr}>${preamble}</script><script type="module" src="${base}@vite/client"${nonceAttr}></script><script type="module" src="${base}@id/__x00__${V.entry}"${nonceAttr}></script>\`
}`
}
