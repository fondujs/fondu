---
name: fondu
description: >-
  Building or changing an app on Fondu (a small React meta-framework on Hono and Vite): routes in app/routes/, pages,
  loaders, actions, forms and validation, links and navigation, layouts, middleware, error pages, static pages,
  deferred props, shared props, typed URLs (href) and the typed fetch for .ts routes, the document, createApp, the Vite
  plugin. Use it before writing any of these, and for the rules of where code runs.
metadata:
  type: core
  library: fondu
  library_version: '0.16.0'
sources:
  - fondujs/fondu:apps/site/app/routes/docs/routes.mdx
  - fondujs/fondu:apps/site/app/routes/docs/pages.mdx
  - fondujs/fondu:apps/site/app/routes/docs/layouts.mdx
  - fondujs/fondu:apps/site/app/routes/docs/errors.mdx
  - fondujs/fondu:apps/site/app/routes/docs/forms.mdx
  - fondujs/fondu:apps/site/app/routes/docs/navigation.mdx
  - fondujs/fondu:apps/site/app/routes/docs/ssr.mdx
  - fondujs/fondu:apps/site/app/routes/docs/static-pages.mdx
  - fondujs/fondu:apps/site/app/routes/docs/document.mdx
  - fondujs/fondu:apps/site/app/routes/docs/server-and-client.mdx
  - fondujs/fondu:apps/site/app/routes/docs/type-safety.mdx
  - fondujs/fondu:apps/site/app/routes/docs/project-structure.mdx
  - fondujs/fondu:apps/site/app/routes/docs/deploying.mdx
  - fondujs/fondu:apps/site/app/routes/docs/api.mdx
---

# Fondu

Fondu is a small meta-framework for full-stack React apps, built on Hono and Vite. It runs on Bun, Cloudflare Workers
and Node. The files in `app/routes/` are the URLs; a page's file holds its server handlers and its React component.
There is no API to write for pages and no client-side router: links and forms are plain `<a>` and `<form>`, and
Fondu's client swaps the page in place.

The docs are the source of truth: https://fondu.dev/docs (every page as Markdown: add `.md`; index:
https://fondu.dev/llms.txt). Most server code is Hono's API: https://hono.dev.

## The model

- A file in `app/routes/` is a URL: `index.tsx` is `/`, `users/[id].tsx` is `/users/:id`. One file per URL.
- A `.tsx` route file is a page. Its default export is the component. `loader` answers GET and calls `render(c, Page,
  props)`; `action` answers POST (one form), or `actions = { name }` answers `POST ?name` (several forms; not both).
- A `.ts` route file is server code only: HTTP methods (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`) for API
  clients and files. It has no `loader`, `action` or `actions`.
- `_layout.tsx` wraps the pages of its directory and below, and nests. `_middleware.ts` runs for its directory and
  below. `_error.tsx` is the app's one error page. Other files and directories starting with `_` are not routes.
- A page is one JSON object, the same for a document and for a navigation: the props of `render()`, the shared props
  (`share()`), `errors`, `flash`. The first request gets HTML; after that the client asks the same route for JSON.
- `createApp()` in `app/server.ts` makes the Hono app from the routes, with CSRF protection, security headers and a
  Content Security Policy. `fondu({ target })` in `vite.config.ts` is the Vite plugin.

```tsx
// app/routes/users/[id].tsx
import { defineHandler, render } from 'fondu'

export const loader = defineHandler.withValidator({ params })(async (c, { params }) =>
  render(c, Show, { user: await getUser(params.id) }),
)

export default function Show({ user }: { user: { name: string } }) {
  return <h1>{user.name}</h1>
}
```

## Rules

- **One way to write each thing.** A route file exports what its kind is for and nothing else; anything else stops
  the app at startup with what to write instead. Code that isn't a route lives outside `app/routes/`, where
  the app's AGENTS.md says.
- **The loader decides the answer.** Status, redirects and cookies are known before the first byte. Await what decides
  them (does the record exist, may the visitor see it) in the loader; never defer it.
- **Server code never reaches the browser.** `.ts` files of `app/routes/`, `app/server.ts` and `*.server.ts` are
  server-only; a page's `loader`, `action`, `actions`, `prerender`, `params` are cut from its browser copy, with the
  imports only they use. A page imports `fondu/client`; `fondu` is the server's. Browser code that imports server
  code fails the build. A type is fine: `import type`, the whole import.
- **Props are public.** They are written into the HTML and the JSON. Send what the page shows, not whole records.
  Props travel as JSON: a `Date` is a string, a `Map`, a `Set` or a function can't be a prop.
- **Links are `<a>`, forms are `<form method="post">`.** After an action, redirect: `back(c)` or
  `c.redirect(url, 303)`, so a reload does not send the form again.
- **URLs come from `href()`** (`fondu/client`), typed after `app/routes/`: `href('/users/:id', { id })`, with
  `{ query, hash }` too. Use it for links, form actions and redirects.
- **Do not reach for** a client-side router, a client cache (React Query, SWR), or `fetch()` for a page's own data:
  the loader and `defer()` are the page's data. `fetch()` from `fondu/client` is for effects and events, calling a
  `.ts` route. Sessions, auth and the data layer are the app's own (or another library's).
- **Providers go in the root `_layout.tsx`**, which stays mounted across navigations. The document
  (`app/document.tsx`) is rendered once on the server and never hydrated: no state, context or effects there.
- **Do not edit** `app/fondu.gen.d.ts` (generated; commit it). After updating a dependency, restart the dev server.
- Errors: `throw new HTTPException(404)` (from `hono/http-exception`) or `c.notFound()`.

## Topics

| Read                                                             | For                                                                                                                           |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [references/routes-and-pages.md](references/routes-and-pages.md) | file names and URLs, params, groups, optional and catch-all segments, `render()`, `share()`, layouts, `_error`, `_middleware` |
| [references/forms.md](references/forms.md)                       | `<form>`, `withValidator`, `useForm`, `back()`, `flash()`, `?name` actions, uploads, body limit                               |
| [references/navigation.md](references/navigation.md)             | `navigate()`, shallow navigation, `closeShallow()`, `reload({ only })`, `useNavigation()`, preloading, Back, scroll           |
| [references/data.md](references/data.md)                         | `defer()` and `<Deferred>`, typed `fetch()` and `FetchError`, when to use which                                               |
| [references/rendering.md](references/rendering.md)               | streaming, Suspense, static pages (`prerender`), `withoutSsr()`, the document and its nonce                                   |
| [references/server.md](references/server.md)                     | `createApp` options, the Vite plugin, middleware, `.ts` routes, Bun, Node and Workers                                         |
| [references/types.md](references/types.md)                       | `fondu.gen.d.ts`, `Register`, typed `href`, `usePage`, what crosses as JSON                                                   |
