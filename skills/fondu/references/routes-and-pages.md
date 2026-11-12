# Routes and pages

Docs: [routes](https://fondu.dev/docs/routes.md), [pages](https://fondu.dev/docs/pages.md),
[layouts](https://fondu.dev/docs/layouts.md), [errors](https://fondu.dev/docs/errors.md).

## File names are URLs

| File                      | URL                                         |
| ------------------------- | ------------------------------------------- |
| `index.tsx`               | `/`                                         |
| `about.tsx`               | `/about`                                    |
| `users/index.tsx`         | `/users`                                    |
| `users/[id].tsx`          | `/users/:id`                                |
| `files/[...path].ts`      | `/files/*`: one or more segments, in `path` |
| `[[lang]]/about.tsx`      | `/about` and `/:lang/about`                 |
| `(marketing)/pricing.tsx` | `/pricing`: a `(group)` adds no segment     |

- Where two routes could take a URL, a static segment wins, then a param with listed values, then any param, then a
  catch-all.
- Two files that answer the same URLs stop the app at startup (`index.tsx` and `[[lang]]/index.tsx`, `about.tsx` and
  `about.ts`). Routes that differ by the values of a param list them with `params`.
- A route has one optional segment at most. `href('/about')` and `href('/:lang/about', { lang: 'de' })` are both typed.
- A param can't be named `query` or `hash`: they are `href()`'s.
- Not routes: files and directories starting with `_`, `*.d.ts`, `*.test.*`, `*.spec.*`.

## The values of a param

```ts
// app/routes/[[lang]]/_middleware.ts (or in the route; the nearest counts)
export const params = { lang: ['de', 'fr'] }
```

`/de/about` and `/fr/about` answer, `/xx/about` is a 404. Values are URL segments: letters, digits, `-`, `.`, `_`, `~`.

## What each file exports

| File                        | Exports                                                                    |
| --------------------------- | -------------------------------------------------------------------------- |
| `.tsx`                      | the page (default), `loader`, `action` or `actions`, `prerender`, `params` |
| `.ts`                       | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `prerender`, `params`  |
| `.mdx`                      | its content: no handlers; `share()` props are in `props`                   |
| `_middleware.ts`            | its middleware (default), `prerender`, `params`                            |
| `_layout.tsx`, `_error.tsx` | the component (default)                                                    |

## A page

```tsx
// app/routes/users/[id].tsx
import { back, defineHandler, render } from 'fondu'

// GET /users/7
export const loader = defineHandler(async (c) =>
  render(c, Show, { user: await getUser(c.req.param('id')) }),
)

export const actions = {
  rename: defineHandler(async (c) => back(c)), // POST /users/7?rename
  delete: defineHandler(async (c) => c.redirect('/users', 303)), // POST /users/7?delete
}

export default function Show({ user }: { user: User }) {
  return (
    <>
      <title>{`${user.name} · My app`}</title>
      <h1>{user.name}</h1>
    </>
  )
}
```

- Without a loader, the page is rendered on GET with no props of its own.
- `render(c, Page, props, { status: 201 })`: `render()` is checked against the component's props.
- A route file renders its own page only. To reuse another page: `export { default } from './index.tsx'`.
- `defineHandler(...middleware, handler)` is Hono's `createHandlers`; `c` is Hono's Context.
- The head: render `<title>`, `<meta>`, `<link>` in the page; React moves them to `<head>`. A title is one string.

## Shared props

```ts
// app/routes/_middleware.ts
import { defineMiddleware, share } from 'fondu'

export default defineMiddleware(async (c, next) => {
  const user = await currentUser(c)
  share(c, { auth: { user: user && { name: user.name } } })
  await next()
})
```

A shared value may be a function: it runs only when a page renders. Read them with `usePage().props` from
`fondu/client`. A page prop named like a shared prop but of another type is a type error.

## Layouts

```tsx
// app/routes/_layout.tsx (the root layout: around every page, the error page too; import the CSS here)
import type { ReactNode } from 'react'

import '../styles/app.css'

export default function Layout({ children }: { children: ReactNode }) {
  return <main>{children}</main>
}
```

- A directory's `_layout.tsx` wraps its pages inside the outer ones. A `(group)/` gives pages a layout without a URL
  segment. A part that must not sit in a layout goes in a directory beside it.
- A layout stays mounted while pages change, so its state is kept. It has no loader: `share()` gives it props, and
  `usePage()` reads them.
- A layout is in the JavaScript of its pages only.

## Error page and middleware

```tsx
// app/routes/_error.tsx: 404, 403, 500…, inside the root layout, with the shared props
export default function ErrorPage({ status }: { status: number }) {
  return <h1>{status === 404 ? 'Page not found' : 'Something went wrong'}</h1>
}
```

Without it, plain text, as for an error page that fails to render (the failure is logged). API clients get plain text or the `HTTPException`'s own response. A page that throws in the
browser gets the error page with 500; a layout that throws, the error page alone.

```ts
// app/routes/admin/_middleware.ts: for admin/ and below, outermost first
import { defineMiddleware } from 'fondu'
import { HTTPException } from 'hono/http-exception'

export default defineMiddleware(async (c, next) => {
  if (c.get('user')?.role !== 'admin') throw new HTTPException(403)
  await next()
})
```

`app/routes/_middleware.ts` runs for every request, unknown URLs included. A middleware for some handlers only goes
in `defineHandler(requireUser, (c) => …)`.
