# Types

Docs: [type safety](https://fondu.dev/docs/type-safety.md).

Each type has one source; nothing is declared twice.

| Source                                | Checks                                                                |
| ------------------------------------- | --------------------------------------------------------------------- |
| a page component's props              | `render(c, Page, props)`: every prop is there and fits                |
| the files in `app/routes/`            | `href('/users/:id', { id })`: the URL exists, its params, its actions |
| a route's query schema                | `href('/search', { query })`: the query the route takes               |
| a handler's schemas (`withValidator`) | the `body`, `query` and `params` the handler receives                 |
| declarations next to your middleware  | `share()`, `flash()`, `usePage()`, `c.get()`                          |

`app/fondu.gen.d.ts` is written by the dev server and the build as the route files change. Commit it, so a fresh clone
or CI has the types before the first build. Don't edit it. No setup beyond `tsconfig.json`.

## `href()`

```tsx
import { href } from 'fondu/client'

href('/users/:id', { id: 7 }) // '/users/7'
href('/users/:id?rename', { id: 7 }) // '/users/7?rename': actions.rename
href('/users/:id') // error: the param is missing
href('/user/:id', { id: 7 }) // error: no such route
href('/search', { query: { q: 'ada', page: 2 }, hash: 'results' }) // '/search?q=ada&page=2#results'
```

With `withValidator({ query })` on the route's loader, a `.ts` file's `GET` or the action, `query` is typed by that
schema; without, any values. A value that is `undefined` or `null` is left out. Use it for a redirect too:
`c.redirect(href('/users/:id', { id: user.id }), 303)`.

## Handler input

`defineHandler.withValidator()` types the input as the schemas parse it: with `z.coerce.number()`, `params.id` is a
`number`.

```ts
const params = z.object({ id: z.coerce.number() })

export const loader = defineHandler.withValidator({ params })(async (c, { params }) => {
  params.id // number
})
```

## Shared props, flash data and context values

```ts
// app/routes/_middleware.ts
declare module 'hono' {
  interface ContextVariableMap {
    user: User | null // c.set('user', …), c.get('user')
  }
}
declare module 'fondu' {
  interface Register {
    shared: { auth: { user: { name: string } | null } } // share(), usePage().props
    flash: { message?: string } // flash(), usePage().flash
  }
}
```

`share()` and `flash()` then take only those, and `usePage()` returns them.

## `usePage()`

From `fondu/client`, in any component: `props` (the page's props with the shared props and `errors`), `url` (path and
query), `flash` (what an action left with `flash()`, shown once), `component`.

```tsx
const { props, url, flash } = usePage()
```

## What crosses as JSON

Props travel as JSON, so the page types what it receives: a `Date` is a `string`, a `Map` or `Set` is `{}`, `undefined`
fields are left out. `render()` checks both sides: `render(c, Show, { post: { title, publishedAt: new Date() } })` is
fine for a page typed `publishedAt: string`. A page that types a prop as `Date`, `Map`, `Set` or a function is an
error at `render()`. Anything with `toJSON()` passes for what that returns.

`Errors` (`fondu/client`) is the type of a page's `errors` prop.
