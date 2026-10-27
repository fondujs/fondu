// The public types, as an app with its own declarations sees them (type checks: `tsc`; each @ts-expect-error must
// be an error): render() by the page component, href() by the routes, share() and flash() by Register's shared and flash,
// withValidator() by its schemas. CONTRIBUTING: "Types are behavior".
import type { Context } from 'hono'
import { expect, test } from 'vitest'
import * as z from 'zod/mini'

import type { href, usePage } from '../src/client.js'
import type { flash } from '../src/server/flash.js'
import type { defineHandler, Validated } from '../src/server/handler.js'
import type { render, share } from '../src/server/protocol.js'

type Auth = { user: string | null }
const searchQuery = z.object({ q: z.string(), page: z.optional(z.coerce.number()) })
const listQuery = z.object({ sort: z.optional(z.enum(['name', 'date'])) })
declare module '../src/types.js' {
  interface Register {
    shared: { auth: Auth }
    flash: { message?: string }
    routes: {
      '/': object
      '/about': object
      '/:lang/about': object
      '/users/:id': { actions: { rename: unknown; delete: unknown } }
      '/files/:path{.+}': object
      '/search': { loader: Validated<{ query: typeof searchQuery }> }
      '/teams/:id': {
        loader: Validated<{ query: typeof listQuery }>
        actions: { invite: Validated<{ query: typeof searchQuery }> }
      }
      '/api/items': { GET: Validated<{ query: typeof listQuery }> }
    }
  }
}

// type-checked only, never called
type Api = {
  render: typeof render
  href: typeof href
  share: typeof share
  flash: typeof flash
  usePage: typeof usePage
  defineHandler: typeof defineHandler
}
const typed = (call: (api: Api, c: Context) => unknown) => call

// pages: a route file's default export
declare function Bare(): null
declare function Titled(props: { title: string; auth: Auth }): null
declare function Clashing(props: { auth: string }): null
declare function Errors(props: { errors?: Record<string, string> }): null

const renders = [
  typed(({ render }, c) => render(c, Bare)),
  // a page without props, with options: its props are {} whatever is shared (#83)
  typed(({ render }, c) => render(c, Bare, {}, { status: 404 })),
  // @ts-expect-error a page without props takes none
  typed(({ render }, c) => render(c, Bare, { title: 'Hello' })),
  // the shared props a page takes may be left out, or given
  typed(({ render }, c) => render(c, Titled, { title: 'Hello' })),
  typed(({ render }, c) => render(c, Titled, { title: 'Hello', auth: { user: null } })),
  // @ts-expect-error a prop is a value (a function is for share(): called when a page renders)
  typed(({ render }, c) => render(c, Titled, { title: async () => 'Hello' })),
  // @ts-expect-error a prop of its own is missing
  typed(({ render }, c) => render(c, Titled, {})),
  // @ts-expect-error a prop of the wrong type
  typed(({ render }, c) => render(c, Titled, { title: 1 })),
  // @ts-expect-error a page prop named like a shared prop, of another type
  typed(({ render }, c) => render(c, Clashing, { auth: 'Ada' })),
  // @ts-expect-error not a component
  typed(({ render }, c) => render(c, 'titled', { title: 'Hello' })),
  // a page's errors come from the form's action: not given
  typed(({ render }, c) => render(c, Errors)),
]

const hrefs = [
  typed(({ href }) => href('/')),
  typed(({ href }) => href('/users/:id', { id: 7 })),
  typed(({ href }) => href('/users/:id', { id: '7' })),
  // one of a route's actions
  typed(({ href }) => href('/users/:id?rename', { id: 7 })),
  // an optional segment: both URLs
  typed(({ href }) => href('/about')),
  typed(({ href }) => href('/:lang/about', { lang: 'de' })),
  // a catch-all, named without its pattern
  typed(({ href }) => href('/files/:path{.+}', { path: 'a/b' })),
  // @ts-expect-error the param is missing
  typed(({ href }) => href('/users/:id')),
  // @ts-expect-error a param named otherwise
  typed(({ href }) => href('/users/:id', { slug: 7 })),
  // @ts-expect-error a URL without params takes none
  typed(({ href }) => href('/', { id: 7 })),
  // @ts-expect-error no such route
  typed(({ href }) => href('/user/:id', { id: 7 })),
  // @ts-expect-error no such action
  typed(({ href }) => href('/users/:id?archive', { id: 7 })),
  // a query and a fragment: any query without a schema
  typed(({ href }) => href('/', { query: { tab: 'new', page: 2 }, hash: 'top' })),
  typed(({ href }) => href('/users/:id', { id: 7, query: { tab: 'posts' } })),
  // a query by its schema (the loader's, a .ts file's GET, the action's); a coerced field takes any value
  typed(({ href }) => href('/search', { query: { q: 'ada', page: 2 } })),
  typed(({ href }) => href('/teams/:id', { id: 1, query: { sort: 'date' } })),
  typed(({ href }) => href('/teams/:id', { id: 1 })),
  typed(({ href }) => href('/teams/:id?invite', { id: 1, query: { q: 'ada' } })),
  typed(({ href }) => href('/api/items', { query: { sort: 'name' } })),
  // @ts-expect-error the schema requires q: the query is required
  typed(({ href }) => href('/search')),
  // @ts-expect-error the schema requires q
  typed(({ href }) => href('/search', { query: { page: 2 } })),
  // @ts-expect-error a value the schema doesn't take
  typed(({ href }) => href('/teams/:id', { id: 1, query: { sort: 'size' } })),
  // @ts-expect-error a field the schema doesn't have
  typed(({ href }) => href('/api/items', { query: { order: 'name' } })),
  // @ts-expect-error the action's schema, not the loader's
  typed(({ href }) => href('/teams/:id?invite', { id: 1, query: { sort: 'date' } })),
]

const shared = [
  typed(({ share }, c) => share(c, { auth: { user: 'Ada' } })),
  // computed when a page is sent
  typed(({ share }, c) => share(c, { auth: async () => ({ user: null }) })),
  // @ts-expect-error a shared prop of the wrong type
  typed(({ share }, c) => share(c, { auth: { user: 7 } })),
  // @ts-expect-error only the declared shared props (an app that declares none shares anything)
  typed(({ share }, c) => share(c, { autk: { user: null } })),
  typed(({ flash }, c) => flash(c, { message: 'Saved' })),
  // @ts-expect-error flash data of the wrong type
  typed(({ flash }, c) => flash(c, { message: 7 })),
  // @ts-expect-error only the declared flash data
  typed(({ flash }, c) => flash(c, { mesage: 'Saved' })),
  // the page on screen: the shared props, the errors, the flash data
  typed(({ usePage }) => {
    const { props, flash } = usePage()
    const user: string | null = props.auth.user
    const email: string | undefined = props.errors.email
    const message: string | undefined = flash.message
    return [user, email, message]
  }),
  // @ts-expect-error not a shared prop
  typed(({ usePage }) => usePage().props.autk),
]

const params = z.object({ id: z.coerce.number() })
const body = z.object({ name: z.string(), tags: z.optional(z.array(z.string())) })
const validated = [
  // the input as the schemas parse it: a coerced param is a number
  typed(({ defineHandler }) =>
    defineHandler.withValidator({ params, body })((c, input) => {
      const id: number = input.params.id
      const tags: string[] | undefined = input.body.tags
      return c.json({ id, tags, name: input.body.name })
    }),
  ),
  // middleware first, up to three
  typed(({ defineHandler }) =>
    defineHandler.withValidator({ params })(
      async (_, next) => next(),
      async (_, next) => next(),
      async (_, next) => next(),
      (c, { params }) => c.json(params.id),
    ),
  ),
  typed(({ defineHandler }) =>
    defineHandler.withValidator({ params })((c, input) => {
      // @ts-expect-error only what has a schema: no body here
      return c.json(input.body)
    }),
  ),
  typed(({ defineHandler }) =>
    defineHandler.withValidator({ params })((c, { params }) => {
      // @ts-expect-error a coerced param is not a string
      const id: string = params.id
      return c.json(id)
    }),
  ),
]

test('the types above are checked by tsc', () => {
  expect([...renders, ...hrefs, ...shared, ...validated]).toHaveLength(48)
})
