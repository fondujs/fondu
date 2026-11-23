import { Hono, type Context, type Handler, type MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { every } from 'hono/combine'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
import { NONCE, secureHeaders } from 'hono/secure-headers'
import { prerender, version } from 'virtual:fondu/assets'

import {
  checkExportNames,
  checkRouteFiles,
  HANDLERS,
  isPageFile,
  isRouteFile,
  METHODS,
  pageId,
} from '../paths.js'
import { settings, type DocumentTemplate } from './document.js'
import { errorResponse } from './errors.js'
import { csrfOrigin, trailingSlash } from './http.js'
import { checkAppOptions } from './options.js'
import { prerenderRoutes, type PrerenderRoute } from './prerender.js'
import { protocol, registerPage, renderPage, routePage } from './protocol.js'
import { routeTable, type Handlers, type RouteModule } from './routes.js'
import { ValidationError, validationErrorResponse } from './validate.js'

export interface CreateAppOptions {
  /** The HTML document around pages (default: a minimal one) */
  document?: DocumentTemplate
  /** `/users/` → `/users` (`'trim'`, default) or the other way (`'append'`): a 301 to a relative URL */
  trailingSlash?: 'trim' | 'append'
  /** `hono/csrf`'s options; `false`: off */
  csrf?: Parameters<typeof csrf>[0] | false
  /** Largest request body in bytes (default 10 MB), then 413; `false`: no limit. The body is read whole, in memory. */
  bodyLimit?: number | false
  /**
   * `hono/secure-headers`' options; `false`: off. Defaults: `referrerPolicy: 'same-origin'` (which `back()` needs) and
   * a Content Security Policy whose directives yours replace one by one; `contentSecurityPolicy: false`: none
   */
  secureHeaders?:
    | (Omit<SecureHeadersOptions, 'contentSecurityPolicy'> & {
        contentSecurityPolicy?: SecureHeadersOptions['contentSecurityPolicy'] | false
      })
    | false
}

type SecureHeadersOptions = NonNullable<Parameters<typeof secureHeaders>[0]>

/** the default Content Security Policy: scripts of this site or with the request's nonce (the document's) */
const CSP = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", NONCE],
  styleSrc: ["'self'", "'unsafe-inline'"], // style attributes (React, Base UI)
  imgSrc: ["'self'", 'data:'],
  fontSrc: ["'self'", 'data:'],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
} satisfies SecureHeadersOptions['contentSecurityPolicy']

const ROOT = '/app/routes/'

const layoutComponent = (value: unknown) =>
  typeof value === 'function' || (typeof value === 'object' && value !== null)

const kind = (value: unknown) =>
  value === null ? 'null' : Array.isArray(value) ? 'a list' : typeof value

const isHandler = (value: unknown) =>
  typeof value === 'function' ||
  (Array.isArray(value) && value.length > 0 && value.every((h) => typeof h === 'function'))

function checkValues(file: string, mod: Record<string, unknown>) {
  const fail = (message: string): never => {
    throw new Error(`fondu: routes/${file}: ${message}`)
  }
  // an `actions` entry is there to be named in `?name`: undefined is a form with no handler, not an absent export
  const handler = (name: string, value: unknown, entry = false) => {
    if ((value !== undefined || entry) && !isHandler(value))
      fail(`${name} is a handler (defineHandler), not ${kind(value)}`)
  }
  for (const name of [...HANDLERS.filter((h) => h !== 'actions'), ...METHODS])
    if (name in mod) handler(name, mod[name])
  if (
    file.split('/').at(-1) === '_middleware.ts' &&
    mod.default !== undefined &&
    !isHandler(mod.default)
  )
    fail(`default is a middleware, \`async (c, next) => …\`, not ${kind(mod.default)}`)
  const actions = mod.actions
  if (actions !== undefined) {
    if (typeof actions !== 'object' || actions === null || Array.isArray(actions))
      fail(`actions is an object of handlers, { name: handler }, not ${kind(actions)}`)
    for (const [name, value] of Object.entries(actions as object))
      handler(`actions.${name}`, value, true)
  }
  const prerender = mod.prerender
  if (prerender !== undefined && typeof prerender !== 'boolean' && typeof prerender !== 'function')
    fail(
      `prerender is true, false or a function returning the params of its pages, not ${kind(prerender)}`,
    )
}

export function checkExports(file: string, mod: Record<string, unknown>) {
  checkExportNames(file, Object.keys(mod))
  checkValues(file, mod)
  if (
    'layout' in mod &&
    (!Array.isArray(mod.layout) ||
      mod.layout.some((parent: unknown) => parent === mod.default || !layoutComponent(parent)))
  )
    throw new Error(
      `fondu: routes/${file}: layout must list React components other than the module's own default export`,
    )
  if ('layout' in mod && new Set(mod.layout as unknown[]).size !== (mod.layout as unknown[]).length)
    throw new Error(`fondu: routes/${file}: layout lists the same component twice`)
  if (/\.(?:tsx|mdx)$/.test(file) && typeof mod.default !== 'function')
    throw new Error(
      `fondu: routes/${file} is a page: its default export is the component (code for the server only: a .ts file)`,
    )
}

const handle =
  (h: Handler | MiddlewareHandler): MiddlewareHandler =>
  async (c, next) => {
    try {
      return await h(c, next)
    } catch (error) {
      if (error instanceof ValidationError) return validationErrorResponse(c, error)
      throw error
    }
  }
const chain = (handlers: Handlers): MiddlewareHandler[] => [handlers].flat().map(handle)

function actionName(url: string): string | null {
  const first = new URL(url).searchParams.entries().next().value
  return first && first[1] === '' ? first[0] : null
}

/**
 * The Hono app from `app/routes/`, found by Vite. Built in: CSRF protection, security headers, one URL per page, the error
 * page and a request body limit. For your own 404 / error handling, use `app.notFound()` / `app.onError()` on the result.
 */
export function createApp(options: CreateAppOptions = {}): Hono {
  checkAppOptions(options)
  const app = new Hono()
  const modules = Object.fromEntries(
    Object.entries(
      // without a type argument: Vitest's module cache leaves out a module with `import.meta.glob(` only
      import.meta.glob(
        [
          '/app/routes/**/*.{ts,tsx,jsx,mdx}', // a .jsx file is found to be refused (routeTable)
          '!/app/routes/**/*.d.ts',
          '!/app/routes/**/*.{test,spec}.*', // test files aren't the app's
          '!/app/routes/**/_*/**', // nor what a directory keeps beside its routes
        ],
        { eager: true },
      ) as Record<string, RouteModule>,
    ).map(([path, mod]) => [path.slice(ROOT.length), mod]),
  )
  // Vite's globs skip hidden paths; this one lists them (never imported) so that they can be refused
  const hidden = Object.keys(
    import.meta.glob(['/app/routes/**/.*.{ts,tsx,mdx}', '/app/routes/**/.*/**/*.{ts,tsx,mdx}'], {
      exhaustive: true,
    }),
  ).map((path) => path.slice(ROOT.length))
  checkRouteFiles([...hidden, ...Object.keys(modules)])
  for (const [file, mod] of Object.entries(modules)) {
    if (!isRouteFile(file) && !/(?:^|\/)_(?:middleware\.ts|layout\.tsx|error\.tsx)$/.test(file))
      continue
    checkExports(file, mod as Record<string, unknown>)
    if (isPageFile(file)) registerPage(mod.default as object, pageId(file))
  }
  const own = {
    document: options.document,
    errorPage: Boolean(modules['_error.tsx']),
  }
  const append = options.trailingSlash === 'append'
  app.use(async (c, next) => {
    settings.set(c, own)
    await next()
  })
  if (options.secureHeaders !== false) {
    const { contentSecurityPolicy: csp, ...headers } = options.secureHeaders ?? {}
    app.use(
      secureHeaders({
        referrerPolicy: 'same-origin',
        ...headers,
        contentSecurityPolicy: csp === false ? undefined : { ...CSP, ...csp },
      }),
    )
  }
  if (options.csrf !== false)
    app.use(csrf({ ...options.csrf, origin: options.csrf?.origin ?? csrfOrigin }))
  const prerendered: PrerenderRoute[] = []
  if (prerender) prerenderRoutes(app, () => prerendered, version)
  app.use(trailingSlash(append), ...protocol)
  app.notFound((c) => errorResponse(c, 404))
  app.onError((error, c) => {
    // the client left (a body cut off mid-upload): nobody is there to answer, so no 500 is logged. Recognised by the request's
    // own signal, as the error's type and message differ by runtime
    if (!(error instanceof HTTPException) && c.req.raw.signal.aborted)
      return new Response(null, { status: 499 })
    if (error instanceof HTTPException && error.res) return error.getResponse()
    return errorResponse(c, error instanceof HTTPException ? error.status : 500, error)
  })

  // a _middleware.ts may only set what applies to its directory (`prerender`, `params`), without a default export
  const rootMiddleware = modules['_middleware.ts']?.default
  if (rootMiddleware) app.use(...chain(rootMiddleware))
  // One limit, in the chain of each route that takes a body, after its directories' middleware (so a 413 has their shared
  // props, and a request they refuse is not read). CSRF stays above: Hono's 403 is plain text, so no page is rendered for it.
  const limit: MiddlewareHandler[] =
    options.bodyLimit === false
      ? []
      : [
          bodyLimit({
            maxSize: options.bodyLimit ?? 10 * 1024 * 1024,
            // Fondu's own answer: the error page for a visitor, the status alone for an API client
            onError: () => {
              throw new HTTPException(413)
            },
          }),
        ]

  const unanswered: { pattern: string; mws: MiddlewareHandler[]; allow: string[] }[] = []
  for (const { file, pattern, path, middleware } of routeTable(modules, append)) {
    const mod = modules[file]!
    const page = isPageFile(file) ? pageId(file) : undefined
    const mws = [
      ...(page ? [routePage(page)] : []),
      ...middleware.flatMap((f) => chain(modules[f]!.default ?? [])),
    ]
    const settingFiles = [file, ...[...middleware].reverse(), '_middleware.ts']
    prerendered.push({
      file,
      pattern: path,
      settings: settingFiles.map((f) => modules[f]?.prerender),
      settingFiles,
      get: Boolean(mod.loader ?? mod.GET ?? page),
      page: page !== undefined,
      others: [
        ...(mod.action || mod.actions || mod.POST ? ['POST'] : []),
        ...METHODS.filter((m) => m !== 'GET' && m !== 'POST' && mod[m]),
      ],
    })
    if (mod.action && mod.actions)
      throw new Error(
        `fondu: routes/${file} exports both \`action\` and \`actions\`: one form posts to \`action\`, several each to one of \`actions\` (?name)`,
      )

    const add = (method: string, handlers: MiddlewareHandler[]) =>
      app.on(method as 'GET', pattern, ...(handlers as [MiddlewareHandler]))
    const get =
      mod.loader ??
      mod.GET ??
      (page === undefined ? undefined : (c: Context) => renderPage(c, page, {}))
    const allow: string[] = get ? ['GET', 'HEAD'] : []
    unanswered.push({ pattern, mws, allow })
    if (get) add('GET', [...mws, ...chain(get)])
    if (mod.action || mod.actions || mod.POST) {
      allow.push('POST')
      const defaultPost = mod.action ?? mod.POST
      const actions = mod.actions ?? {}
      add('POST', [
        ...mws,
        ...limit,
        async (c, next) => {
          const name = actionName(c.req.url)
          const picked = mod.actions
            ? name !== null && Object.hasOwn(actions, name)
              ? actions[name]
              : undefined
            : defaultPost
          if (!picked) return c.notFound()
          return every(...chain(picked))(c, next)
        },
      ])
    }
    for (const method of METHODS) {
      if (method === 'GET' || method === 'POST') continue
      const h = mod[method]
      if (h) allow.push(method)
      if (h) add(method, [...mws, ...(method === 'OPTIONS' ? [] : limit), ...chain(h)])
    }
  }
  for (const { pattern, mws, allow } of unanswered)
    app.all(
      pattern,
      ...([
        ...mws,
        (c, next) => {
          if (allow.includes(c.req.method)) return next()
          c.header('Allow', allow.join(', '))
          return errorResponse(c, 405)
        },
      ] as [MiddlewareHandler]),
    )
  return app
}
