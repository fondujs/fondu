# Data

Docs: [pages](https://fondu.dev/docs/pages.md#deferred-props), [routes](https://fondu.dev/docs/routes.md#calling-a-route-from-the-browser).

## Which to use

| Need                                            | Use                                             |
| ----------------------------------------------- | ----------------------------------------------- |
| a page's own data                               | the loader: `render(c, Page, props)`            |
| a slow part of a page, which must not hold it   | `defer(() => …)` and `<Deferred>`               |
| data every page needs (the user)                | `share(c, …)` in a `_middleware.ts`             |
| the page's props again, after something changed | `reload()` or `reload({ only: [...] })`         |
| a call from an effect or an event (a toggle)    | `fetch()` from `fondu/client`, to a `.ts` route |
| an API for other clients                        | a `.ts` route with `GET`, `POST`…               |

`fetch()` is not for a page's data: called during the server render it throws.

## Deferred props

`defer()` marks a prop of `render()`. The page is sent without it; the browser asks for it once the page is shown.

```tsx
// app/routes/dashboard.tsx
import { defer, defineHandler, render } from 'fondu'
import { Deferred } from 'fondu/client'

export const loader = defineHandler((c) =>
  render(c, Dashboard, { user, stats: defer(() => loadStats()) }),
)

export default function Dashboard({ user, stats }: { user: User; stats?: Stats }) {
  return (
    <>
      <h1>{user.name}</h1>
      <Deferred data="stats" fallback={<p>Loading…</p>} failed={<p>The stats are not available.</p>}>
        <Chart stats={stats!} />
      </Deferred>
    </>
  )
}
```

- The prop must be optional in the page's type (`stats?: Stats`): `render()` accepts `defer()` for optional props only.
- `<Deferred data>` shows its children when the prop is there, `fallback` while it is asked for, `failed` (default:
  `fallback`) when it could not be had. `data` may be a list: `data={['stats', 'feed']}`. In the document, and without
  JavaScript, the page shows the fallback.
- The request is quiet: no `useNavigation()` state, no progress bar, no history entry, no scroll change. A navigation
  cancels it. Back to the page asks again.
- The whole loader runs again for that request, so what it awaits before `render()` is awaited each time: put slow
  work inside `defer()`. It answers only the props asked for, no shared props. A function that throws is logged and
  its prop is left out; the status stays 200.
- What decides the status or a redirect is awaited in the loader, never deferred.
- A static page evaluates its deferred props at build time.
- `reload({ only: ['stats'] })` asks again for those props, in the same way, and the page keeps its state.

## `fetch()` for `.ts` routes

```tsx
import { fetch, FetchError } from 'fondu/client'

const usage = await fetch('/api/usage') // the GET's c.json() type, as JSON delivers it: a Date is a string
const user = await fetch('/api/users/:id', { id: 42, query: { full: 'yes' } })
await fetch('/api/settings', { method: 'POST', body: { emails: false } })

try {
  await fetch('/api/settings', { method: 'POST', body: { emails: 'no' } })
} catch (error) {
  if (error instanceof FetchError && error.status === 422) showErrors(error.data.errors)
}
```

- The path is a `.ts` route of the app (a page's pattern is not one), with its params as `href()` takes them.
- `method` is one the file exports; GET when left out (required when the file has no `GET`).
- `query` and `body` are typed by the handler's `withValidator` schemas; a body only for a method other than GET, sent
  as JSON. `headers` and `signal` pass through.
- The answer is what the handler returns with `c.json()`, as JSON delivers it; any other answer is `unknown`.
- A non-2xx answer throws `FetchError` with `status`, `data` (the parsed body: a 422's `{ errors }`) and `response`.
  No retry, no cache: use an effect, `use()` or a library of your own.

```ts
// app/routes/api/health.ts
import { defineHandler } from 'fondu'

export const GET = defineHandler((c) => c.json({ ok: true }))
```
