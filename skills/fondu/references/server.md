# Server

Docs: [api](https://fondu.dev/docs/api.md), [project structure](https://fondu.dev/docs/project-structure.md),
[deploying](https://fondu.dev/docs/deploying.md), [server and client code](https://fondu.dev/docs/server-and-client.md).

## The files

```
app/
├─ server.ts           # export default createApp()
├─ routes/             # the URLs; _middleware.ts, _layout.tsx, _error.tsx
└─ fondu.gen.d.ts      # generated (commit it, don't edit it)
vite.config.ts         # plugins: [fondu({ target: 'node' })]
```

`package.json` maps `#/*` to `./app/*`: `import { db } from '#/db/index.server.ts'` works anywhere in `app/`. The rest
of `app/` is the app's: one arrangement is `components/`, `modules/<domain>/` (server code, schemas), `lib/`, `db/`.

## `createApp(options?)`

Returns the Hono app made of `app/routes/`. It has CSRF protection, security headers, a Content Security Policy,
`/users/` redirecting to `/users` and error pages built in.

| Option          | Is                                                                      |
| --------------- | ----------------------------------------------------------------------- |
| `document`      | the HTML around pages (see [rendering.md](rendering.md))                |
| `trailingSlash` | `'trim'` (default) or `'append'`                                        |
| `csrf`          | `hono/csrf`'s options, or `false`                                       |
| `bodyLimit`     | the largest request body in bytes (default 10 MB, then 413), or `false` |
| `secureHeaders` | `hono/secure-headers`' options, or `false`                              |

The options are checked when `createApp()` is called: an unknown option (there is no `port`), a wrong type, or a
`bodyLimit` that is not a positive number or `false` throws `fondu: createApp(): …`.

`secureHeaders` sets `Referrer-Policy: same-origin` by default, and `back()` relies on it: with a policy that sends no
`Referer` to this site, `back()` goes to its fallback.

`bodyLimit` reads the body in memory: raise it only a little. A limit by path: [forms.md](forms.md#files-and-nested-fields).

The default Content Security Policy: `default-src 'self'`; scripts of the site or with the request's nonce; inline
styles; `data:` images and fonts; `object-src 'none'`; `base-uri 'self'`. A directive you give replaces that one only,
so keep what it had:

```ts
import { NONCE } from 'hono/secure-headers'

createApp({
  secureHeaders: {
    contentSecurityPolicy: {
      scriptSrc: ["'self'", NONCE, 'https://static.cloudflareinsights.com'],
      connectSrc: ["'self'", 'https://cloudflareinsights.com'],
    },
  },
})
```

`contentSecurityPolicy: false`: no policy. `createApp()` returns a Hono app: `app.onError()` and `app.notFound()`
replace Fondu's.

## The Vite plugin

`fondu(options)` from `fondu/vite`: The options are checked when the plugin is created: `target` is required, and an unknown option fails. There is
no `port` option: the built server (Bun and Node) listens on `PORT`, else 3000.

| Option            | Is                                                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target`          | `'bun'`, `'cloudflare'` or `'node'`                                                                                                                 |
| `ssr`             | `false`: pages render in the browser only                                                                                                           |
| `progress`        | the progress bar: `{ color, delay, forms }` (default: the text color, 350 ms, forms included), or `false`                                           |
| `viewTransitions` | `true`: every navigation runs inside the browser's view transition by default, and a link or call opts out: [navigation.md](navigation.md)          |
| `react`           | passed to `@vitejs/plugin-react` (its `include` has `.mdx` by default): https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-react |

On Cloudflare, the Cloudflare plugin comes first:
`plugins: [cloudflare({ viteEnvironment: { name: 'ssr' } }), fondu({ target: 'cloudflare' })]`.

## Server code

`.ts` files of `app/routes/`, `app/server.ts` and `*.server.ts` run on the server only; browser code that imports one
fails the build. Name a module `*.server.ts` when it must never reach the browser.

- A route file's top-level imports run at startup for every page: import heavy dependencies in the handler
  (`await import('#/lib/pdf.server.ts')`).
- Don't import a server module from a page for a helper it also uses: put what both share in a module of its own.
- Env: on Bun and Node `process.env`, in server code only. In development Fondu loads `.env`, `.env.local`,
  `.env.development` and `.env.development.local` into it; a variable already set wins. In production the server
  reads them itself: Node's `start` script has `--env-file-if-exists=.env` (`.env` alone, Node 22.12 or later), Bun reads
  `.env`, `.env.production` and `.env.local`. On Cloudflare `import { env } from 'cloudflare:workers'`
  (variables, secrets, bindings; typed by `cf-typegen`; `c.env` is untyped). `import.meta.env.VITE_*` goes into the
  browser's bundle: public values only.
- In development, an edit to a page keeps its state (Fast Refresh); an edit to a handler makes the page ask for its
  props again; an edit to `app/server.ts` reloads. The dev server doesn't watch `node_modules`: restart it after an
  update.

## Middleware and `.ts` routes

- `_middleware.ts` (default export, `defineMiddleware`): runs for its directory and below, outermost first.
  `defineHandler(requireUser, handler)` runs a middleware for one handler.
- A `.ts` route has the HTTP method names as exports, and `c.json()`, `c.body()`, `c.text()`:

```ts
// app/routes/api/health.ts
import { defineHandler } from 'fondu'

export const GET = defineHandler((c) => c.json({ ok: true }))
```

- Throw `HTTPException` (`hono/http-exception`) or return `c.notFound()` for errors.
- To log every request in development (the CSRF 403, the trailing-slash redirect included), a `logger()` in
  `_middleware.ts` is too late. Wrap the app in an outer Hono app in `app/server.ts`: `outer.use(logger())`, then
  `outer.all('*', (c) => app.fetch(c.req.raw, c.env, executionCtx(c)))`, and `export default import.meta.env.DEV ? outer : app`.
  Not `outer.route('/', app)` (it drops the not-found page), not `mount()` (deprecated); keep `notFound` and `onError`
  on `app`. On Bun, pass `app.websocket` along if the app sets one. The full recipe: <https://fondu.dev/docs/routes#logging-every-request-in-development>.

## Targets

- **Node**: `npm run build` (`vite build`), `npm start` (`node dist/server/index.js`); `PORT` (else 3000); the
  dependencies stay in `node_modules`. On SIGTERM the server waits up to 10 s for running requests.
- **Bun**: the same build with `target: 'bun'`; `NODE_ENV=production bun dist/server/index.js` (Bun reads `NODE_ENV` as it starts, so set it for Bun's own mode).
- **Cloudflare Workers**: `npm run deploy` (`vite build && wrangler deploy`). `wrangler.jsonc`'s `main` is
  `./app/server.ts`; bindings and variables are declared there, secrets in `.dev.vars` and `wrangler secret put`.
  `npm run cf-typegen` writes `worker-configuration.d.ts`.
- Behind a proxy that terminates TLS: pass `Host` on and set `X-Forwarded-Proto: https`. Fondu compares hosts (not
  schemes) for `Referer`, `Origin` and redirects to this site; `X-Forwarded-Host` is not read. Its own redirects
  (`back()`, the trailing slash, a new version) are paths.
- On Node and Bun, compression and conditional requests (`If-None-Match`…) are the proxy's or CDN's job.
- Pages are streamed: a proxy in front must not buffer responses (nginx: `proxy_buffering off`).
- Built assets in `/assets/` are cached for a year; pages are `Cache-Control: private, no-cache`.
  A document is `Vary: X-Fondu`; a navigation also varies on `X-Fondu-Version`, `X-Fondu-Only` and `X-Fondu-Component`.
  Some CDNs ignore custom `Vary` headers: check yours before caching pages publicly.

## For proxies, CDNs and tests

Header names, cookie names and `/_fondu/*` paths between Fondu's server and client are internal and may change in any
release. What can be relied on: `Vary` as above, and `Vary: Accept` on a response that `Accept` chooses; a navigation
(`X-Fondu: true`) from an old build is a 409 with `X-Fondu-Location`, the URL to load as a document. Statuses Fondu
answers itself: 303 (`back()`, a form's `ValidationError`), 400 (a body or query that is not one object), 405 (with
`Allow`), 409, 413 (over `bodyLimit`), 415 (a body that is neither JSON nor form data), 422 (`ValidationError` for an API
client, a GET with an invalid query), 499 (the client left).

## Versioning

Before 1.0, a minor release may break an app and a patch release does not. A type that starts to reject code that
already misbehaves at runtime is a fix, not a break.
