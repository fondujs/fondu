# Fondu

**Inertia v3 on Hono.** The browser runs `@inertiajs/react` as it is; the server is Hono with Fondu's Inertia v3
protocol; `app/routes/` holds the server side (loader, action, actions), `app/pages/` the React pages. The same app
runs on **Node, Bun and Cloudflare Workers**.

Fondu is glue, not a new framework: it joins Hono, Inertia and Vite, and writes as little of its own as it can.

## Quick start

```bash
bun create fondu my-app      # or: npm create fondu@latest my-app · pnpm create fondu my-app
cd my-app
bun dev
```

It asks where the app runs (Node, Bun or Cloudflare Workers; or `--target node|bun|cloudflare`) and writes a small
app: a route, its page, the error page, Tailwind CSS, editor snippets and an `AGENTS.md` for coding agents.

[apps/demo](apps/demo) shows every Inertia v3 feature, one page each, on Cloudflare Workers with D1 and Better Auth.

## Who does what

| Part                                                                                                                                | Done by                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Browser: visits, history, prefetch, forms, progress, `<Head>`, deferred, merging, infinite scroll, optimistic updates, Precognition | `@inertiajs/react`                                                                             |
| HTTP, middleware, CSRF, security headers, trailing slashes                                                                          | Hono and its middleware                                                                        |
| Dev server, production build                                                                                                        | Node / Bun: `@hono/vite-dev-server`, `@hono/vite-build`; Cloudflare: `@cloudflare/vite-plugin` |
| Page resolution, the server render's entry                                                                                          | `@inertiajs/vite` (rendered in the same process)                                               |
| The Inertia v3 server protocol, `routes/`, generated types, the document, error pages, server-only guard                            | Fondu                                                                                          |

## An app

```
package.json         fondu hono @inertiajs/react react react-dom   (Node: also @hono/node-server)
                     "imports": { "#/*": "./app/*" }: import '#/lib/db.server.ts' from anywhere in app/
vite.config.ts       plugins: [fondu({ target: 'node' })]   'bun'; Cloudflare: [cloudflare(), fondu({ target: 'cloudflare' })]
app/
  server.ts          export default createApp()
  app.tsx            createInertiaApp({ pages: './pages', … }): browser and server render
  routes/            server code only; the file path is the URL
    _middleware.ts     for its directory and below (routes/_middleware.ts: every request, 404s too)
    index.ts           /
    users/[id].ts      /users/:id
    api/health.ts      /api/health
  pages/             React pages, rendered by name: 'users/show' is pages/users/show.tsx
    error.tsx          the error page (404, 403, 500…)
  fondu.gen.d.ts     generated types (commit it)
```

`createApp()` comes with CSRF protection, security headers (`Referrer-Policy: same-origin`, which `back()` needs), a
Content Security Policy, one URL per page (`/users/` → `/users`) and error handling. Options: `document` (the HTML
around pages: `<html>` attributes, the viewport, fonts…), `errorPage`, `trailingSlash: 'append'`, `csrf` and
`secureHeaders` (Hono's options, or `false`).

The policy: `default-src 'self'`, scripts of this site or with the request's nonce (the document's scripts have it),
inline styles (style attributes), `data:` images and fonts, no plugins (`object-src 'none'`), `base-uri 'self'`. A
directive of yours replaces that one: `secureHeaders: { contentSecurityPolicy: { fontSrc: ["'self'",
'https://fonts.gstatic.com'] } }`; `contentSecurityPolicy: false`: none.

### routes/: loader, action, actions

```ts
// app/routes/users/[id].ts
import { back, defineHandler, flash, render } from 'fondu'
import * as z from 'zod/mini'

const params = z.object({ id: z.coerce.number() })

export const loader = defineHandler.withValidator({ params })(async (c, { params }) =>
  // GET /users/7
  render(c, 'users/show', { user: await getUser(params.id) }),
)

export const actions = {
  rename: defineHandler.withValidator({ params, body: renameSchema })(requireUser, async (c, { params, body }) => {
    await renameUser(params.id, body.name) // POST /users/7?rename
    return back(c)
  }),
}
```

- `loader` is GET, `action` POST, `actions.x` `POST ?x` (a plain form can pick one). HTTP routes export `GET` / `POST` / `PUT` / `PATCH` / `DELETE`.
- `defineHandler(...middleware, handler)` is Hono's `createHandlers`. `.withValidator({ body, query, params })(...middleware, (c, input) => …)`: the middleware first (up to three; more: `every()` from `hono/combine`), then the schemas (any Standard Schema).
- Every `.ts` file in `routes/` is a route, except `_middleware.ts` and tests. `(group)` directories take no URL segment.

### Validation (Inertia's way)

Invalid `body` or `query`: Inertia visits and plain forms get a 303 back with the errors in the next page's `errors`
prop (in the `X-Inertia-Error-Bag` bag when there is one); API clients get 422 `{ errors }`. Params that don't fit are
a 404. A Precognition request (`<Form>`'s `validate()`, `useForm().withPrecognition()`) is only validated: 204 or 422.
The same schema can be imported by the page to check before sending.

### Pages and props

```tsx
// app/pages/users/show.tsx — the component's parameter is the page's props
export default function Show({ user }: { user: User }) { … }
```

`render(c, 'users/show', props, options?)` takes only pages that exist, with the component's props; a page prop named
like a shared prop is a type error. A function prop is called only when it is sent.

| prop                                               |                                                                                                |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `optional(fn)`                                     | only when a partial reload names it                                                            |
| `always(v)`                                        | partial reloads too                                                                            |
| `defer(fn, { group?, rescue? })`                   | after the page renders, one request per group; `rescue`: a failure is listed in `rescuedProps` |
| `merge` / `prepend` / `deepMerge(v, { matchOn? })` | merged with what the client holds                                                              |
| `once(fn, { key?, ttl?, fresh? })`                 | skipped when the client holds it                                                               |
| `scroll(fn, { pageName? })`                        | a page of a list for `<InfiniteScroll>`: `{ data, currentPage, previousPage, nextPage }`       |

Options: `status`, `encryptHistory`, `clearHistory`, `preserveFragment`. Also `flash(c, data)`, `clearHistory(c)`,
`back(c)`, `location(c, url)` (409 + `X-Inertia-Location`); a redirect with a `#fragment` becomes a 409
`X-Inertia-Redirect` by itself.

### Types

```ts
// where the values are set (e.g. routes/_middleware.ts)
declare module 'hono' {
  interface ContextVariableMap {
    user: User | null
  } // c.get('user')
}
declare module '@inertiajs/core' {
  interface InertiaConfig {
    sharedPageProps: { auth: { user: { name: string } | null } } // share(), usePage().props
    flashDataType: { message?: string } // flash(), usePage().flash
  }
}
```

`href(path, params?)` from `fondu/client`: a URL of `routes/` (or one of a file's actions: `'/users/:id?rename'`),
params required, a typo is a type error. The method is Inertia's: `<Link href={href('/logout')} method="post" as="button">`.

### Server-side rendering

Document loads are rendered on the server in the same process, then hydrated. Off for the whole app:
`fondu({ ssr: false })`. Off for some routes: `withoutSsr()` (in a `_middleware.ts` for a directory, or in one
handler). A browser-only part of a page: Inertia's `<WhenMounted>`.

### Errors

Unknown URLs and thrown errors: API clients get plain text; pages get `pages/error.tsx` with `{ status }`, inside the
layout with the shared props. In development a 500 is a report of the error instead (Inertia shows it in its dialog
during a visit). `render()` of a page that doesn't exist says which file to create. Your own handling: Hono's
`app.notFound()` / `app.onError()` on the app `createApp()` returns.

### Editor snippets

`.vscode/fondu.code-snippets`: `/route`, `/api`, `/loader`, `/action`, `/actions`, `/validated`, `/get` … `/delete`,
`/middleware` in routes; `/page`, `/layout`, `/form` in pages. A new app has it; edit it freely.

## Deploying

- **Node**: `vite build --mode client && vite build`, then `NODE_ENV=production node dist/index.js` (dependencies stay in `node_modules`; `NODE_ENV` makes React use its production build). `PORT` sets the port (default 3000); SIGTERM / SIGINT wait for running requests (10 s).
- **Bun**: `fondu({ target: 'bun' })`, `NODE_ENV=production bun dist/index.js`.
- **Cloudflare Workers**: `wrangler.jsonc` `main` is `./app/server.ts`; one `vite build` (the Worker minified: it starts faster; `build.minify: false` in its Vite environment keeps it readable); `wrangler deploy`. `/assets/*` get long-lived caching from a generated `_headers` (unless `public/_headers` exists).

## Contributing

```
packages/fondu          the package (≈1,100 lines)
packages/create-fondu   `bun create fondu`
apps/demo               every Inertia v3 feature, one page each — Workers, D1, Better Auth, Base UI
```

```bash
bun install            # also builds packages/fondu (the examples use the built package, like a real app)
bun run test           # the protocol, on a small app with app.request()
bun run typecheck      # the package and the demo (with apps/demo/e2e/types.ts)
bun run check          # format (oxfmt), lint (oxlint), typecheck
bun run dev            # rebuild packages/fondu on change
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org) (lefthook runs commitlint, and formats and
lints what is staged). A release: `bun run release` picks the version, tags it and pushes; CI publishes the tag to npm
(trusted publishing, with provenance) and writes the GitHub Release from the commits.

`apps/demo`: `cp .dev.vars.example .dev.vars`, then `bun run dev` (in workerd), `bun run preview`, `bun run deploy`.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the details, and [SECURITY.md](SECURITY.md) to report a vulnerability.

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.
