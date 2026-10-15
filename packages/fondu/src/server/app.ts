import { Hono, type Handler, type MiddlewareHandler } from 'hono'
import { every } from 'hono/combine'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
import { NONCE, secureHeaders } from 'hono/secure-headers'
import { appendTrailingSlash, trimTrailingSlash } from 'hono/trailing-slash'
import { prerender, version } from 'virtual:fondu/assets'

import { isRouteFile, middlewareFor, routePattern } from '../paths.js'
import { settings, type DocumentTemplate } from './document.js'
import { errorResponse } from './errors.js'
import { prerenderRoutes, type Prerender, type PrerenderRoute } from './prerender.js'
import { protocol } from './protocol.js'
import { ValidationError, validationErrorResponse } from './validate.js'

type Handlers = Handler | MiddlewareHandler | ReadonlyArray<Handler | MiddlewareHandler>
interface RouteModule {
  /** `fondu({ prerender: true })`: written as static files at build time (also in a `_middleware.ts`) */
  prerender?: Prerender
  loader?: Handlers
  action?: Handlers
  actions?: Record<string, Handlers>
  GET?: Handlers
  POST?: Handlers
  PUT?: Handlers
  PATCH?: Handlers
  DELETE?: Handlers
  OPTIONS?: Handlers
}

export interface CreateAppOptions {
  /** the HTML document around pages (default: a minimal one) */
  document?: DocumentTemplate
  /** the page for 404 / 500… (it gets `{ status }`), default `'error'` (`app/pages/error.tsx`); `false`: plain text */
  errorPage?: string | false
  /** `/users/` → `/users` (`'trim'`, default) or the other way (`'append'`): Hono's trailing-slash middleware */
  trailingSlash?: 'trim' | 'append'
  /** `hono/csrf`'s options; `false`: off */
  csrf?: Parameters<typeof csrf>[0] | false
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
  styleSrc: ["'self'", "'unsafe-inline'"], // style attributes (React, Base UI), Inertia's progress bar
  imgSrc: ["'self'", 'data:'],
  fontSrc: ["'self'", 'data:'],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
} satisfies SecureHeadersOptions['contentSecurityPolicy']

const ROOT = '/app/routes/'
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const

/** a thrown `ValidationError` becomes the page it came from with its errors (or 422 for an API client) */
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

/** the action a POST asks for: `?update` (the first query key, without a value) */
function actionName(url: string): string | null {
  const first = new URL(url).searchParams.entries().next().value
  return first && first[1] === '' ? first[0] : null
}

/**
 * The Hono app from `app/routes/` (found by Vite, no generated code). Each file is a URL; it exports:
 * - `loader` (GET), `action` (POST), `actions` (POST `?name`) — usually rendering a page from `app/pages/`
 * - or plain HTTP handlers: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`
 * `_middleware.ts` applies to its directory and below (`routes/_middleware.ts`: every request, 404s included).
 * Built in: CSRF protection, security headers, one URL per page (trailing slash), the error page. Your own 404 /
 * error handling: Hono's `app.notFound()` / `app.onError()` on the returned app.
 */
export function createApp(options: CreateAppOptions = {}): Hono {
  const app = new Hono()
  const own = { document: options.document, errorPage: options.errorPage ?? 'error' }
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
  if (options.csrf !== false) app.use(csrf(options.csrf))
  const prerendered: PrerenderRoute[] = []
  if (prerender) prerenderRoutes(app, () => prerendered, version)
  app.use(append ? appendTrailingSlash() : trimTrailingSlash(), ...protocol)
  app.notFound((c) => errorResponse(c, 404))
  app.onError((error, c) => {
    if (error instanceof HTTPException && error.res) return error.getResponse()
    return errorResponse(c, error instanceof HTTPException ? error.status : 500, error)
  })

  const modules = import.meta.glob<RouteModule & { default?: Handlers }>(
    ['/app/routes/**/*.ts', '!/app/routes/**/*.d.ts', '!/app/routes/**/*.{test,spec}.ts'], // test files aren't the app's
    { eager: true },
  )
  const files = Object.keys(modules).map((k) => k.slice(ROOT.length))
  // a _middleware.ts may only set what applies to its directory (`prerender`), without a default export
  const rootMiddleware = modules[ROOT + '_middleware.ts']?.default
  if (rootMiddleware) app.use(...chain(rootMiddleware))
  const middlewareFiles = files.filter((f) => f.endsWith('/_middleware.ts'))
  const routes = files
    .filter(isRouteFile)
    // static before dynamic before catch-all, segment by segment
    .map((file) => ({ file, pattern: withSlash(routePattern(file), append), mod: modules[ROOT + file]! }))
    .sort((a, b) => rank(a.pattern).localeCompare(rank(b.pattern)))

  for (const { file, pattern, mod } of routes) {
    const mws = middlewareFor(file, middlewareFiles).flatMap((f) => chain(modules[ROOT + f]!.default ?? []))
    prerendered.push({
      file,
      pattern,
      settings: [file, ...middlewareFor(file, [...middlewareFiles, '_middleware.ts']).reverse()].map(
        (f) => modules[ROOT + f]?.prerender,
      ),
      get: Boolean(mod.loader ?? mod.GET),
      others: [
        ...(mod.action || mod.actions || mod.POST ? ['POST'] : []),
        ...METHODS.filter((m) => m !== 'GET' && m !== 'POST' && mod[m]),
      ],
    })
    const conflict = (a: keyof RouteModule, b: keyof RouteModule) => {
      if (mod[a] && mod[b])
        throw new Error(`fondu: routes/${file} exports both \`${a}\` and \`${b}\`, which handle the same requests`)
    }
    conflict('loader', 'GET')
    conflict('action', 'POST')
    conflict('actions', 'POST')

    const add = (method: string, handlers: MiddlewareHandler[]) =>
      app.on(method as 'GET', pattern, ...(handlers as [MiddlewareHandler]))
    const get = mod.loader ?? mod.GET
    if (get) add('GET', [...mws, ...chain(get)])
    if (mod.action || mod.actions || mod.POST) {
      const defaultPost = mod.action ?? mod.POST
      const actions = mod.actions ?? {}
      add('POST', [
        ...mws,
        async (c, next) => {
          const name = actionName(c.req.url)
          const picked =
            name !== null && Object.hasOwn(actions, name)
              ? actions[name]
              : name === null || !mod.actions
                ? defaultPost
                : undefined
          if (!picked) return c.notFound()
          return every(...chain(picked))(c, next)
        },
      ])
    }
    for (const method of METHODS) {
      if (method === 'GET' || method === 'POST') continue
      const h = mod[method]
      if (h) add(method, [...mws, ...chain(h)])
    }
  }
  return app
}

const withSlash = (pattern: string, append: boolean) =>
  append && pattern !== '/' && !pattern.endsWith('}') ? pattern + '/' : pattern

/** sort key: static segments first, then `:param`, then catch-alls */
const rank = (pattern: string) =>
  pattern
    .split('/')
    .map((s) => (s.includes('{') ? '2' : s.startsWith(':') ? '1' : '0') + s)
    .join('/')
