# Data

Docs: [pages](https://fondu.dev/docs/pages.md#a-slow-prop), [routes](https://fondu.dev/docs/routes.md#calling-a-route-from-the-browser).

## Which to use

| Need                                            | Use                                               |
| ----------------------------------------------- | ------------------------------------------------- |
| a page's own data                               | the loader: `render(c, Page, props)`              |
| a slow part of a page, which must not hold it   | `request()` from the page, to a `.ts` route       |
| data every page needs (the user)                | `share(c, …)` in a `_middleware.ts`               |
| the page's props again, after something changed | `reload()`                                        |
| a call from an effect or an event (a toggle)    | `request()` from `fondu/client`, to a `.ts` route |
| an API for other clients                        | a `.ts` route with `GET`, `POST`…                 |

`request()` is not for a page's data: called during the server render it throws.

## A slow prop

A page is sent with all its props. To keep a slow one from holding it, render the page without it and call a `.ts` route
from the page with `request()`. Put the `.ts` route in the page's directory (`dashboard/stats.ts` beside
`dashboard/index.tsx`), under the same `_middleware.ts`. A `.ts` route is guarded only by the `_middleware.ts` files above
it: one outside the directory is open to anyone who asks for its URL.

```tsx
// app/routes/dashboard/index.tsx
import { defineHandler, render } from 'fondu'
import { request } from 'fondu/client'
import { useEffect, useState } from 'react'

export const loader = defineHandler((c) => render(c, Dashboard, { user: currentUser(c) }))

export default function Dashboard({ user }: { user: User }) {
  const [stats, setStats] = useState<Stats | null>()
  useEffect(() => {
    const ask = new AbortController()
    // an error shows as "not available"; leaving the page aborts the request
    request('/dashboard/stats', { signal: ask.signal }).then(setStats, () => setStats(null))
    return () => ask.abort()
  }, [])
  return (
    <>
      <h1>{user.name}</h1>
      {stats === undefined ? <p>Loading…</p> : stats === null ? <p>Not available.</p> : <Chart stats={stats} />}
    </>
  )
}
```

The route is `app/routes/dashboard/stats.ts` with `export const GET = defineHandler(async (c) => c.json(await loadStats()))`.

- The document and a page without JavaScript show the loading state (`undefined`); a failed request shows the error state
  (`null`), and leaving the page aborts the request.
- What decides the status or a redirect is awaited in the loader.
- A promise as a prop of `render()` (`{ stats: loadStats() }`) throws: JSON would send `{}`. `await` it. A promise inside
  a prop is not checked.

## `request()` for `.ts` routes

```tsx
import { request, RequestError } from 'fondu/client'

const usage = await request('/api/usage') // the GET's c.json() type, as JSON delivers it: a Date is a string
const user = await request('/api/users/:id', { id: 42, query: { full: 'yes' } })
await request('/api/settings', { method: 'POST', body: { emails: false } })

try {
  await request('/api/settings', { method: 'POST', body: { emails: 'no' } })
} catch (error) {
  if (error instanceof RequestError && error.status === 422) {
    const data = error.data
    if (typeof data === 'object' && data !== null && 'errors' in data) showErrors(data.errors)
  }
}
```

- The path is a `.ts` route of the app (a page's pattern is not one), with its params as `href()` takes them.
- `method` is one the file exports; GET when left out. Required for any other method (also when type arguments name
  it), and when the file has no `GET`.
- `request()`'s options are `method`, `query`, `body`, `headers` and `signal`: that set is fixed, and no route param can
  have one of these names.
- `query` and `body` are typed by the handler's `withValidator` schemas; a body only for a method other than GET, sent
  as JSON. `headers` and `signal` pass through.
- The answer is what the handler returns with `c.json()`, as JSON delivers it; any other answer is `unknown`.
- A non-2xx answer throws `RequestError` with `status`, `data` (the parsed body, typed `unknown`: narrow it; a 422's is `{ errors }`) and `response`.
  No retry, no cache: use an effect, `use()` or a library of your own.

```ts
// app/routes/api/health.ts
import { defineHandler } from 'fondu'

export const GET = defineHandler((c) => c.json({ ok: true }))
```
