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

`fondu(options)` from `fondu/vite`:

| Option      | Is                                                                       |
| ----------- | ------------------------------------------------------------------------ |
| `target`    | `'bun'`, `'cloudflare'` or `'node'`                                      |
| `port`      | the production port on Bun and Node, 3000 by default (`PORT` overrides)  |
| `ssr`       | `false`: pages render in the browser only                                |
| `prerender` | `true`: write the chosen pages as static files                           |
| `progress`  | the progress bar: `{ color, delay, forms }`, or `false`                  |
| `react`     | options for `@vitejs/plugin-react` (its `include` has `.mdx` by default) |

On Cloudflare, the Cloudflare plugin comes first:
`plugins: [cloudflare({ viteEnvironment: { name: 'ssr' } }), fondu({ target: 'cloudflare' })]`.

## Server code

`.ts` files of `app/routes/`, `app/server.ts` and `*.server.ts` run on the server only; browser code that imports one
fails the build. Name a module `*.server.ts` when it must never reach the browser.

- A route file's top-level imports run at startup for every page: import heavy dependencies in the handler
  (`await import('#/lib/pdf.server.ts')`).
- Don't import a server module from a page for a helper it also uses: put what both share in a module of its own.
- Env: on Bun and Node `process.env`, in server code only. On Cloudflare `import { env } from 'cloudflare:workers'`
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

## Targets

- **Node**: `npm run build` (`vite build`), `npm start` (`NODE_ENV=production node dist/server/index.js`); `PORT`; the
  dependencies stay in `node_modules`. On SIGTERM the server waits up to 10 s for running requests.
- **Bun**: the same build with `target: 'bun'`; `NODE_ENV=production bun dist/server/index.js`.
- **Cloudflare Workers**: `npm run deploy` (`vite build && wrangler deploy`). `wrangler.jsonc`'s `main` is
  `./app/server.ts`; bindings and variables are declared there, secrets in `.dev.vars` and `wrangler secret put`.
  `npm run cf-typegen` writes `worker-configuration.d.ts`.
- Pages are streamed: a proxy in front must not buffer responses (nginx: `proxy_buffering off`).
- Built assets in `/assets/` are cached for a year; pages are `Cache-Control: private, no-cache`.
