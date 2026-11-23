# Types

Docs: [type safety](https://fondu.dev/docs/type-safety.md).

Each type has one source; nothing is declared twice.

| Source                                | Checks                                                                |
| ------------------------------------- | --------------------------------------------------------------------- |
| a page component's props              | `render(c, Page, props)`: every prop is there and fits                |
| the files in `app/routes/`            | `href('/users/:id', { id })`: the URL exists, its params, its actions |
| a route's query schema                | `href('/search', { query })`: the query the route takes               |
| a handler's schemas (`withValidator`) | the `body`, `query` and `params` the handler receives                 |
| a `.ts` route's handlers              | `request()`: the params, `query` and `body` it takes, and its answer  |
| declarations next to your middleware  | `share()`, `flash()`, `usePage()`, `c.get()`                          |

`app/fondu.gen.d.ts` is written by the dev server and the build as the route files change. Commit it, so a fresh clone
or CI has the types before the first build. A new app ships it. Don't edit it. No setup beyond `tsconfig.json`.

With no `routes` registered (no file), `href()` and `request()` fail to type-check with `Run vite dev or vite build to
generate app/fondu.gen.d.ts`; so does an app with no routes. A library or package with no app opts out with
`declare module 'fondu' { interface Register { routes: string } }`: any string is then a path.

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
schema; without, any values (strings, numbers, booleans, lists and objects of them). A value that is `undefined` or `null`
is left out. A list is written `tag[]=a` (one item too), an object `user[name]=Ada`, a list of objects or lists with
indexes (`rows[0][a]=1`), as `withValidator({ query })` reads them. Numbers and booleans are written as text and read
back as strings, so the schema parses them; an empty list or object is left out and reads back as absent, so give the
field a default. Use it for a redirect too:
`c.redirect(href('/users/:id', { id: user.id }), 303)`.

## Handler input

`defineHandler.withValidator()` types the input as the schemas parse it: with `z.coerce.number()`, `params.id` is a
`number`.

```ts
const idParams = z.object({ id: z.coerce.number() })

export const loader = defineHandler.withValidator({ params: idParams })(async (c, { params }) => {
  params.id // number
})
```

## Calls to a route

`request()` (`fondu/client`) is typed by the `.ts` route it calls: the path is a `.ts` route of the app, its params are
`href()`'s, `query` and `body` come from the handler's `withValidator` schemas, and the answer is what the handler
returns with `c.json()`, as JSON delivers it (`unknown` for any other answer). See [data.md](data.md).

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

From `fondu/client`, in any component: `component` (the page's id: its route file's path in `app/routes/`, without the
extension, `users/[id]`), `props` (the page's props with the shared props and `errors`), `url` (path and query), `flash`
(what an action left with `flash()`, shown once). Its type is `Page`; `usePage<P>()` returns `Page<P>`.

```tsx
const { props, url, flash } = usePage()
```

## What crosses as JSON

Props travel as JSON, so the page types what it receives: a `Date` is a `string`, a `Map` or `Set` is `{}`, `undefined`
fields are left out. `render()` checks both sides: `render(c, Show, { post: { title, publishedAt: new Date() } })` is
fine for a page typed `publishedAt: string`. A page that types a prop as `Date`, `Map`, `Set` or a function is an
error at `render()`. Anything with `toJSON()` passes for what that returns.

## `AsJson<T>`: props from your data

A page declares its props; `render()` checks every writer (a loader, an action, middleware) against them. To write the
type once, from the data's own type, use `AsJson<T>` (`fondu`, a type only): `T` after the JSON round trip, as a page
receives it.

- `Date`, or anything with `toJSON()`, becomes what that returns (a `Date` is a `string`).
- `undefined` properties become optional, and `undefined` in an array becomes `null`.
- Functions and symbols are left out of objects, and are `null` in arrays.
- `Map`, `Set` and other objects with no own data become `{}`.
- A `bigint` is a type error, as `JSON.stringify` throws on it.
- Unions, tuples and readonly arrays keep their shape.

These rules are guaranteed; the exact shape of the `bigint` error is not.

`render()` takes what becomes the page's type: a page that declares `AsJson<Row>` gets a `Row` (with its `Date`) from the
loader. Don't rewrite the row's type by hand (`Omit<Row, 'createdAt'> & { createdAt: string }`).

```tsx
// a whole Drizzle row (props are public: a whole row sends every column; select the ones the page shows)
type Contact = AsJson<typeof contacts.$inferSelect>
export default function Contacts({ contacts }: { contacts: Contact[] }) { … }
```

```tsx
// a selected shape: a query function in the route file, its type used in a type position only
const listContacts = () =>
  db.select({ id: contacts.id, name: contacts.name, createdAt: contacts.createdAt }).from(contacts)

export const loader = defineHandler(async (c) =>
  render(c, Contacts, { contacts: await listContacts() }),
)

type Props = { contacts: AsJson<Awaited<ReturnType<typeof listContacts>>> }
```

`typeof listContacts` is not a use, so the browser's copy of the file drops the query. When an action or another route
needs it too, move it to a `*.server.ts` module and import it in the page with `import type { listContacts } from …`
(the whole import as `import type`).

```tsx
// a form's values: from its schema (the action's `body` is already typed by withValidator)
type Values = z.infer<typeof newContactSchema>
```

`AsJson` goes by the declared type: it can't tell that a class getter, or an `Error`'s `message`, is not own data (convert
such a value first). It needs a concrete type: for an unresolved type parameter, TypeScript reports an error.

`Errors` (`fondu/client`) is the type of a page's `errors` prop. `fondu/client` also exports the types `Href`, `Navigation`
and `Page`; `fondu` exports `Register`, `AsJson`, `RenderOptions`, `DocumentParts`, `DocumentTemplate` and `CreateAppOptions`;
`fondu/vite` exports `FonduOptions` and `ProgressOptions`.
