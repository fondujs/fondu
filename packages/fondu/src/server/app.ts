import { Hono, type Context, type Handler, type MiddlewareHandler } from 'hono'
import { every } from 'hono/combine'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
import { NONCE, secureHeaders } from 'hono/secure-headers'
import { appendTrailingSlash, trimTrailingSlash } from 'hono/trailing-slash'
import { prerender, version } from 'virtual:fondu/assets'

import { isPageFile, isRouteFile, pageId } from '../paths.js'
import { settings, type DocumentTemplate } from './document.js'
import { errorResponse } from './errors.js'
import { prerenderRoutes, type PrerenderRoute } from './prerender.js'
import { protocol, registerPage, renderPage, routePage } from './protocol.js'
import { routeTable, type Handlers, type RouteModule } from './routes.js'
import { ValidationError, validationErrorResponse } from './validate.js'

export interface CreateAppOptions {
  /** the HTML document around pages (default: a minimal one) */
  document?: DocumentTemplate
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
  styleSrc: ["'self'", "'unsafe-inline'"], // style attributes (React, Base UI)
  imgSrc: ["'self'", 'data:'],
  fontSrc: ["'self'", 'data:'],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
} satisfies SecureHeadersOptions['contentSecurityPolicy']

const ROOT = '/app/routes/'
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const
const HANDLERS = ['loader', 'action', 'actions'] as const
const CONFIG = ['prerender', 'params'] as const

/**
 * What a file of `app/routes/` may export, and what to do with anything else: a page's route file is its page and
 * the handlers of its URL; the rest of its code goes to modules of its own (the browser gets the page alone)
 */
function exportsOf(file: string): { allowed: readonly string[]; hint: string } {
  const name = file.split('/').at(-1)!
  if (name === '_middleware.ts')
    return { allowed: ['default', ...CONFIG], hint: 'its middleware (default), prerender, params' }
  if (/^_(?:layout|error)\.[jt]sx$/.test(name))
    return { allowed: ['default'], hint: 'its component only (default)' }
  if (file.endsWith('.mdx'))
    return {
      allowed: [],
      hint: "its content: an MDX page has no handlers (a _middleware.ts's prerender, params)",
    }
  if (file.endsWith('.ts'))
    return {
      allowed: [...HANDLERS, ...METHODS, ...CONFIG],
      hint: 'loader, action or actions, GET, POST…, prerender, params',
    }
  return {
    allowed: ['default', ...HANDLERS, ...CONFIG],
    hint: 'its page (default), loader, action or actions, prerender, params; the rest goes to a module of its own',
  }
}

function checkExports(file: string, mod: Record<string, unknown>) {
  const { allowed, hint } = exportsOf(file)
  const mdx = file.endsWith('.mdx')
  const extra = Object.keys(mod).filter((k) =>
    mdx ? [...HANDLERS, ...METHODS, ...CONFIG].includes(k as never) : !allowed.includes(k),
  )
  if (extra.length)
    throw new Error(
      `fondu: routes/${file} exports ${extra.map((k) => `\`${k}\``).join(', ')}. It exports ${hint}`,
    )
  if (/\.(?:[jt]sx|mdx)$/.test(file) && typeof mod.default !== 'function')
    throw new Error(
      `fondu: routes/${file} is a page: its default export is the component (code for the server only: a .ts file)`,
    )
}

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
 * The Hono app from `app/routes/` (found by Vite, no generated code). Each file is a URL:
 * - a page, `.tsx` or `.mdx`: its component (default), `loader` (GET; without one, the page with no props of its
 *   own), `action` (POST) or `actions` (POST `?name`)
 * - server code, `.ts`: the same handlers, or plain HTTP ones: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`
 * `_middleware.ts` applies to its directory and below (`routes/_middleware.ts`: every request, 404s included).
 * Built in: CSRF protection, security headers, one URL per page (trailing slash), the error page. Your own 404 /
 * error handling: Hono's `app.notFound()` / `app.onError()` on the returned app.
 */
export function createApp(options: CreateAppOptions = {}): Hono {
  const app = new Hono()
  const modules = Object.fromEntries(
    Object.entries(
      // without a type argument: Vitest's module cache leaves out a module with `import.meta.glob(` only
      import.meta.glob(
        [
          '/app/routes/**/*.{ts,tsx,jsx,mdx}',
          '!/app/routes/**/*.d.ts',
          '!/app/routes/**/*.{test,spec}.{ts,tsx,jsx}', // test files aren't the app's
          '!/app/routes/**/_*/**', // nor what a directory keeps beside its routes
        ],
        { eager: true },
      ) as Record<string, RouteModule>,
    ).map(([path, mod]) => [path.slice(ROOT.length), mod]),
  )
  for (const [file, mod] of Object.entries(modules)) {
    if (
      !isRouteFile(file) &&
      !/(?:^|\/)_(?:middleware\.ts|layout\.[jt]sx|error\.[jt]sx)$/.test(file)
    )
      continue // a file of a directory's own (`_badge.tsx`)
    checkExports(file, mod as Record<string, unknown>)
    if (isPageFile(file)) registerPage(mod.default as object, pageId(file))
  }
  const own = {
    document: options.document,
    errorPage: Boolean(modules['_error.tsx'] ?? modules['_error.jsx']),
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
  if (options.csrf !== false) app.use(csrf(options.csrf))
  const prerendered: PrerenderRoute[] = []
  if (prerender) prerenderRoutes(app, () => prerendered, version)
  app.use(append ? appendTrailingSlash() : trimTrailingSlash(), ...protocol)
  app.notFound((c) => errorResponse(c, 404))
  app.onError((error, c) => {
    if (error instanceof HTTPException && error.res) return error.getResponse()
    return errorResponse(c, error instanceof HTTPException ? error.status : 500, error)
  })

  // a _middleware.ts may only set what applies to its directory (`prerender`, `params`), without a default export
  const rootMiddleware = modules['_middleware.ts']?.default
  if (rootMiddleware) app.use(...chain(rootMiddleware))

  for (const { file, pattern, path, middleware } of routeTable(modules, append)) {
    const mod = modules[file]!
    const page = isPageFile(file) ? pageId(file) : undefined
    // a page's route: render() renders that page; with no loader, a GET renders it with no props of its own
    const mws = [
      ...(page ? [routePage(page)] : []),
      ...middleware.flatMap((f) => chain(modules[f]!.default ?? [])),
    ]
    prerendered.push({
      file,
      pattern: path,
      settings: [file, ...[...middleware].reverse(), '_middleware.ts'].map(
        (f) => modules[f]?.prerender,
      ),
      get: Boolean(mod.loader ?? mod.GET ?? page),
      others: [
        ...(mod.action || mod.actions || mod.POST ? ['POST'] : []),
        ...METHODS.filter((m) => m !== 'GET' && m !== 'POST' && mod[m]),
      ],
    })
    const conflict = (a: keyof RouteModule, b: keyof RouteModule) => {
      if (mod[a] && mod[b])
        throw new Error(
          `fondu: routes/${file} exports both \`${a}\` and \`${b}\`, which handle the same requests`,
        )
    }
    conflict('loader', 'GET')
    conflict('action', 'POST')
    conflict('actions', 'POST')
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
    if (get) add('GET', [...mws, ...chain(get)])
    if (mod.action || mod.actions || mod.POST) {
      const defaultPost = mod.action ?? mod.POST
      const actions = mod.actions ?? {}
      add('POST', [
        ...mws,
        async (c, next) => {
          const name = actionName(c.req.url)
          // actions: the one named (?name), else none; otherwise the one action
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
      if (h) add(method, [...mws, ...chain(h)])
    }
  }
  return app
}
