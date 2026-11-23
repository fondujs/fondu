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
import { isPageFile, layoutsOf, pageId } from '../paths.js'
import { nonceAttr, productionAssets } from './assets.js'
import { checkRoutes, routesPrerender } from './check.js'
import { entryCode, SERVER } from './entry.js'
import { hmr, PAGE_EXPORTS, PROPS_EVENT } from './hmr.js'
import { HONO } from './hono.js'
import { fonduInstalled } from './installed.js'
import { devServerNodeServer } from './node-server.js'
import { checkOptions } from './options.js'
import { nodeServer, prerender, worker } from './prerender.js'
import { stripRoutes, stripServerCode } from './strip.js'
import { typegen, walk as walkFiles } from './typegen.js'

/** `vite.config.ts`: `plugins: [fondu({ target: 'node' })]` (or `'bun'`; for Cloudflare: `cloudflare()` and `fondu({ target: 'cloudflare' })`). */
export interface FonduOptions {
  target: 'node' | 'bun' | 'cloudflare'
  /** `false`: pages render in the browser only, no server render is built (an admin app). Per route: `withoutSsr()` */
  ssr?: boolean
  react?: ReactOptions
  /** The bar at the top of the page while a navigation is on its way; `false`: none. */
  progress?: ProgressOptions | false
  /**
   * `true`: a navigation that shows another page runs inside `document.startViewTransition`, typed `navigation-forward`,
   * `navigation-back` or `navigation-replace`. Off by default: a navigation opts in with `data-transition`.
   */
  viewTransitions?: boolean
}

const DEV_CSS = '/@fondu/dev.css'
const V = {
  entry: 'virtual:fondu/entry',
  assets: 'virtual:fondu/assets',
  ssr: 'virtual:fondu/ssr',
  serverEntry: 'virtual:fondu/server-entry',
}
const resolved = (id: string) => '\0' + id

const PAGES_GLOB = [
  '/app/routes/**/*.{tsx,mdx}',
  '!/app/routes/**/_*',
  '!/app/routes/**/_*/**',
  '!/app/routes/**/*.{test,spec}.*',
]
const ERROR_GLOB = '/app/routes/_error.tsx'
const LAYOUTS_GLOB = ['!/app/routes/**/_*/**', '/app/routes/**/_layout.tsx']

// The scan would find the server's dependencies otherwise, and bundle them for the browser.
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

// The server never mounts or hydrates a page, but fondu/client imports `react-dom/client` at its top: React's whole browser
// renderer, about a third of a Worker and of its start. On every target it is a module that says so if called
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
  const prerendering = { on: false }
  const node = options.target !== 'cloudflare'
  return [
    // .mdx too: MDX pages and components get Fast Refresh (as MDX's own docs set it up)
    react({ include: /\.(?:[jt]sx?|mdx)$/, ...options.react }),
    core(options, prerendering),
    stripRoutes(),
    hmr(),
    loadFailure(),
    typegen(),
    checkRoutes(),
    ...(node ? runtimePlugins(options, prerendering) : []),
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

// Node / Bun: dist/server/index.js. The client build's files first (found next to the server bundle wherever it runs
// from), then the app. Node: serve() on `PORT` (else 3000) with a graceful shutdown on SIGTERM / SIGINT (10 s). Bun serves
// the default export itself.
function serverEntry(options: FonduOptions, prerendering: Prerendering): Plugin {
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
        return entryCode(options, paths, assetsDir, prerendering.on)
      },
    },
  }
}

function runtimePlugins(options: FonduOptions, prerendering: Prerendering): PluginOption[] {
  return [
    {
      // dev: the app's .env files (Vite's `envDir`) go into `process.env`, as server code reads them; a variable already set stays.
      // Vite loads them for `import.meta.env` only, and only the `VITE_` ones. Cloudflare has its own, `.dev.vars`.
      name: 'fondu:env',
      apply: 'serve',
      configResolved(config) {
        for (const [key, value] of Object.entries(loadEnv(config.mode, config.envDir, '')))
          process.env[key] ??= value
      },
    },
    {
      // dev: the same Request / Response globals as the production server's: middleware that re-creates the request
      // (hono/body-limit) needs them
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
    serverEntry(options, prerendering),
  ]
}

// Dev: the app that fails to load is Vite's error page, which a navigation can't show as a page: it loads the URL as a
// document instead (409), where Vite's overlay shows the error; the next change reloads it.
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

interface Prerendering {
  on: boolean
}

function core(options: FonduOptions, prerendering: Prerendering): Plugin {
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
                if (prerendering.on && existsSync(wrangler)) {
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
      // Node / Bun: the client into dist/client, then the server into dist/server, then the pages to prerender
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
            if (prerendering.on)
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
    // dev: the dependencies are found before the first request (Vite scans index.html by default; an app has none), so the
    // first page is not reloaded once they are optimized. The scan reads JavaScript, so MDX pages are compiled for it.
    configEnvironment(name, env) {
      const pages = ['app/routes/**/*.{tsx,mdx}']
      const mdx = { extensions: ['.mdx'], rolldownOptions: { plugins: [scanMdx(() => config)] } }
      if (name === 'client')
        return {
          optimizeDeps: {
            entries: pages,
            // both are pre-bundled in one run, so they share one module of the client (one React context, one navigation state);
            // only for an installed fondu: a linked one stays as Vite treats linked packages
            ...(fonduInstalled() && { include: ['fondu/client', 'fondu/client/internal'] }),
            ...mdx,
            rolldownOptions: {
              plugins: [...mdx.rolldownOptions.plugins, scanRoutes(() => config.root)],
            },
          },
        }
      if (options.target !== 'cloudflare') return
      // the Worker: fondu is not pre-bundled (its routes import it back: a bundle would hand them a half-loaded module), so the
      // scan does not see what it imports (HONO, react, react-dom, react-dom/server). Found late, they would restart the Worker
      // in the middle of requests. Minified, as Workers start faster with less code to parse
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
      prerendering.on = c.command === 'build' && routesPrerender(c.root)
    },
    // dev: the CSS the layouts import, as a stylesheet in the document, so a server-rendered page is styled at first paint
    // (Vite would add it only once the JS runs); removed by fondu/client once the page's layouts are loaded
    configureServer(server) {
      server.middlewares.use(`${config.base}${DEV_CSS.slice(1)}`, async (req, res) => {
        const env = server.environments.client
        const css: string[] = []
        try {
          const component = new URL(req.url ?? '/', 'http://localhost').searchParams.get('page')
          const files = walkFiles(resolve(config.root, 'app/routes'))
          const page = files.find(
            (f) => (isPageFile(f) || f === '_error.tsx') && pageId(f) === component,
          )
          // the page and the layouts of its own directories, as the production build bundles them
          const entries = page
            ? [
                ...layoutsOf(page)
                  .map((dir) => `${dir ? `${dir}/` : ''}_layout.tsx`)
                  .filter((f) => files.includes(f)),
                page,
              ]
            : []
          const seen = new Set<string>()
          async function walk(url: string) {
            await env.transformRequest(url)
            const mod = await env.moduleGraph.getModuleByUrl(url)
            for (const dep of mod?.importedModules ?? []) {
              if (seen.has(dep.url)) continue
              seen.add(dep.url)
              if (/[?&](?:inline|raw|url|worker|sharedworker)(?:[&=]|$)/.test(dep.url)) continue
              if (isCSSRequest(dep.url)) css.push(dep.url)
              else if (
                !env.depsOptimizer?.isOptimizedDepUrl(dep.url) &&
                !dep.id?.includes('/node_modules/')
              )
                await walk(dep.url)
            }
          }
          for (const f of entries) await walk('/app/routes/' + f)
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
      if (id === resolved(V.entry)) {
        const dev = this.environment.config.consumer === 'client' && !isBuild
        const settings = {
          prerender: prerendering.on,
          progress: options.progress ?? {},
          viewTransitions: Boolean(options.viewTransitions),
        }
        const glob = (pattern: string | string[]) => `import.meta.glob(${JSON.stringify(pattern)})`
        return [
          `import { __entry } from 'fondu/client/internal'`,
          ...(dev ? [`import { reload } from 'fondu/client'`] : []),
          ...(dev ? [`import.meta.hot?.on(${JSON.stringify(PROPS_EVENT)}, () => reload())`] : []),
          `__entry({ ...${glob(PAGES_GLOB)}, ...${glob(ERROR_GLOB)} }, ${glob(LAYOUTS_GLOB)}, ${JSON.stringify(settings)})`,
        ].join('\n')
      }
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
          `\nexport const prerender = ${prerendering.on}`
        )
      // the server-only guard: browser code must never import server code
      if (this.environment.config.consumer === 'client' && isServerOnly(id, config.root)) {
        this.error(
          `fondu: ${id.replace(config.root, '')} is server code (routes/*.ts, server.ts, *.server.ts) and cannot be imported by browser code`,
        )
      }
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
 * The built Worker's config: URLs ending in index go to the Worker first, as static assets would answer them with the page
 * of their directory (`/docs/index` → `docs/index.html`). Added to the app's own `run_worker_first`, unless it is `true`.
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
