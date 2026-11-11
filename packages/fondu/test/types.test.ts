// The public types, as an app with its own declarations sees them (type checks: `tsc`; each @ts-expect-error must
// be an error): render() by the page component, href() by the routes, share() and flash() by Register's shared and flash,
// withValidator() by its schemas. CONTRIBUTING: "Types are behavior".
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { expect, test } from 'vitest'
import * as z from 'zod/mini'

import type { fetch, href, useForm, useNavigation, usePage } from '../src/client.js'
import type { flash } from '../src/server/flash.js'
import {
  defineHandler as define,
  type defineHandler,
  type Validated,
} from '../src/server/handler.js'
import { back } from '../src/server/http.js'
import type { defer, render, share } from '../src/server/protocol.js'

type Auth = { user: string | null }
const searchQuery = z.object({ q: z.string(), page: z.optional(z.coerce.number()) })
const listQuery = z.object({ sort: z.optional(z.enum(['name', 'date'])) })
// the route files fetch() calls: their handlers, as `typeof import('./app/routes/…')` has them
const getUsage = define((c) => c.json({ used: Number(c.req.query('used')), limit: 10 }))
const getClock = define((c) =>
  c.json({ at: new Date(), nested: { when: new Date() }, gone: undefined, n: 1 as number }),
)
const getUser = define.withValidator({
  params: z.object({ id: z.coerce.number() }),
  query: listQuery,
})((c, { params }) => c.json({ id: params.id, name: 'Ada' }))
const getSearch = define.withValidator({ query: searchQuery })(async (c, { query }) =>
  c.json({ found: [query.q] }),
)
const getSettings = define((c) => c.json({ emails: true }))
const postSettings = define.withValidator({
  body: z.object({ emails: z.boolean(), theme: z.optional(z.string()) }),
})((c, { body }) => c.json({ saved: body.emails }))
const patchSettings = define.withValidator({ body: z.object({ theme: z.optional(z.string()) }) })(
  (c) => c.json({ saved: true }),
)
const postToken = define.withValidator({ body: z.object({ name: z.string() }) })((c, { body }) =>
  c.json({ token: body.name }),
)
const getText = define((c) => c.text('hello'))
const getOutcome = define.withValidator({ query: listQuery })((c, { query }) =>
  query.sort ? c.json({ a: Number(query.sort) }) : c.json({ b: 'x' as string }),
)
const getRedirect = define.withValidator({ query: listQuery })((c) => c.redirect('/'))
const postBack = define.withValidator({ body: z.object({}) })((c) => back(c))
const getMaybe = define.withValidator({ query: listQuery })((c, { query }) => {
  if (query.sort === 'name') throw new HTTPException(404)
  if (query.sort === 'date') return c.body(null, 204)
  return c.json({ ok: Boolean(query) })
})
const getThrows = define.withValidator({ query: listQuery })((c, { query }) => {
  if (query.sort === 'name') throw new HTTPException(404)
  return c.json({ ok: Boolean(query) })
})

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
      '/users/:id/files/:path{.+}': { actions: { remove: unknown } }
      '/search': { loader: Validated<{ query: typeof searchQuery }> }
      '/teams/:id': {
        loader: Validated<{ query: typeof listQuery }>
        actions: { invite: Validated<{ query: typeof searchQuery }> }
      }
      '/api/items': { GET: Validated<{ query: typeof listQuery }> }
      '/api/usage': { GET: typeof getUsage }
      '/api/clock': { GET: typeof getClock }
      '/api/users/:id': { GET: typeof getUser }
      '/api/search': { GET: typeof getSearch }
      '/api/settings': {
        GET: typeof getSettings
        POST: typeof postSettings
        PATCH: typeof patchSettings
      }
      '/api/tokens': { POST: typeof postToken }
      '/api/hello': { GET: typeof getText }
      '/api/outcome': { GET: typeof getOutcome }
      '/api/redirect': { GET: typeof getRedirect; POST: typeof postBack }
      '/api/maybe': { GET: typeof getMaybe }
      '/api/throws': { GET: typeof getThrows }
    }
  }
}

// a body on a GET is what must fail (the lint rule would say the same)
/* oxlint-disable unicorn/no-invalid-fetch-options */
// type-checked only, never called
type Api = {
  render: typeof render
  defer: typeof defer
  href: typeof href
  fetch: typeof fetch
  share: typeof share
  flash: typeof flash
  usePage: typeof usePage
  useNavigation: typeof useNavigation
  useForm: typeof useForm
  defineHandler: typeof defineHandler
}
const typed = (call: (api: Api, c: Context) => unknown) => call

// pages: a route file's default export
declare function Bare(): null
declare function Titled(props: { title: string; auth: Auth }): null
declare function Clashing(props: { auth: string }): null
declare function Errors(props: { errors?: Record<string, string> }): null

type Stats = { total: number }
declare function Dashboard(props: { title: string; stats?: Stats; at?: string }): null
declare function Maybe(props: { stats: Stats | undefined }): null
declare function Dated(props: { when?: Date }): null

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
  // defer(): a prop the page takes as optional; the function gives what the prop is, sync or async, or what JSON makes it
  typed(({ render, defer }, c) =>
    render(c, Dashboard, { title: 'x', stats: defer(() => ({ total: 1 })) }),
  ),
  typed(({ render, defer }, c) =>
    render(c, Dashboard, { title: 'x', stats: defer(async () => ({ total: 1 })) }),
  ),
  typed(({ render, defer }, c) =>
    render(c, Dashboard, { title: 'x', at: defer(() => new Date()) }),
  ),
  // a deferred prop's own value, or none, as for any optional prop
  typed(({ render }, c) => render(c, Dashboard, { title: 'x', stats: { total: 1 } })),
  typed(({ render }, c) => render(c, Dashboard, { title: 'x' })),
  // @ts-expect-error a required prop is not deferred: the page renders without it
  typed(({ render, defer }, c) => render(c, Dashboard, { title: defer(() => 'x') })),
  // @ts-expect-error required, though it may be undefined
  typed(({ render, defer }, c) => render(c, Maybe, { stats: defer(() => ({ total: 1 })) })),
  // @ts-expect-error what the function gives is not the prop's type
  typed(({ render, defer }, c) => render(c, Dashboard, { title: 'x', stats: defer(() => 1) })),
  // @ts-expect-error a prop JSON can't deliver can't be deferred either
  typed(({ render, defer }, c) => render(c, Dated, { when: defer(() => 1) })),
  // @ts-expect-error defer() takes a function
  typed(({ defer }) => defer({ total: 1 })),
  // @ts-expect-error a shared prop is on every page: not deferred
  typed(({ share, defer }, c) => share(c, { auth: defer(async () => ({ user: null })) })),
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
  // a param before a catch-all: each its own name, with an action too
  typed(({ href }) => href('/users/:id/files/:path{.+}', { id: 7, path: 'a/b' })),
  typed(({ href }) => href('/users/:id/files/:path{.+}?remove', { id: 7, path: 'a/b' })),
  // @ts-expect-error the param before the catch-all is missing
  typed(({ href }) => href('/users/:id/files/:path{.+}', { path: 'a/b' })),
  // @ts-expect-error the catch-all is missing
  typed(({ href }) => href('/users/:id/files/:path{.+}', { id: 7 })),
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

// the browser's hooks: a navigation that failed has a place to go, an idle one has none
const navigation = [
  typed(({ useNavigation }) => {
    const nav = useNavigation()
    if (nav.state === 'failed') {
      const to: string = nav.to
      const form: HTMLFormElement | null = nav.form
      return [to, form]
    }
  }),
  typed(({ useNavigation }) => {
    const nav = useNavigation()
    if (nav.state === 'idle') {
      const to: null = nav.to
      // @ts-expect-error an idle navigation goes nowhere
      const place: string = nav.to
      return [to, place]
    }
  }),
  typed(({ useNavigation }) => {
    const nav = useNavigation()
    if (nav.state === 'loading' || nav.state === 'submitting') return nav.to.length
  }),
  typed(({ useForm }) => {
    const { failed, submitting } = useForm()
    const a: boolean = failed
    const b: boolean = submitting
    // @ts-expect-error failed is a boolean
    const c: string = failed
    return [a, b, c]
  }),
]

// is the type exactly T (both ways: `any` and a wider type are not)
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const exactly =
  <T>() =>
  <A>(value: A, ..._: Equal<A, T> extends true ? [] : [error: 'not the same type']) =>
    value

type ClockWithDate = { at: Date; nested: { when: string }; n: number }
// fetch(): a `.ts` route's answer as JSON delivers it, by the route file's own types
const fetches = [
  typed(async ({ fetch }) => exactly<{ used: number; limit: number }>()(await fetch('/api/usage'))),
  // a Date arrives as a string, nested too; an undefined field is dropped
  typed(async ({ fetch }) =>
    exactly<{ at: string; nested: { when: string }; n: number }>()(await fetch('/api/clock')),
  ),
  // @ts-expect-error a Date is not what arrives
  typed(async ({ fetch }) => exactly<ClockWithDate>()(await fetch('/api/clock'))),
  // params, as href() takes them; the handler's answer (a validated one, params and query)
  typed(async ({ fetch }) =>
    exactly<{ id: number; name: string }>()(await fetch('/api/users/:id', { id: 7 })),
  ),
  typed(({ fetch }) => fetch('/api/users/:id', { id: '7' })),
  // @ts-expect-error the param is missing
  typed(({ fetch }) => fetch('/api/users/:id')),
  // @ts-expect-error the param is missing
  typed(({ fetch }) => fetch('/api/users/:id', { query: { sort: 'name' } })),
  // @ts-expect-error a param named otherwise
  typed(({ fetch }) => fetch('/api/users/:id', { slug: 7 })),
  // @ts-expect-error a route without params takes none
  typed(({ fetch }) => fetch('/api/usage', { id: 7 })),
  // a query, by the schema of the method (optional or required fields)
  typed(({ fetch }) => fetch('/api/users/:id', { id: 7, query: { sort: 'name' } })),
  typed(({ fetch }) => fetch('/api/search', { query: { q: 'ada', page: 2 } })),
  typed(async ({ fetch }) =>
    exactly<{ found: string[] }>()(await fetch('/api/search', { query: { q: 'ada' } })),
  ),
  // @ts-expect-error a value the schema doesn't take
  typed(({ fetch }) => fetch('/api/users/:id', { id: 7, query: { sort: 'size' } })),
  // @ts-expect-error a field of the wrong type
  typed(({ fetch }) => fetch('/api/search', { query: { q: 1 } })),
  // @ts-expect-error the schema requires q: the query is required
  typed(({ fetch }) => fetch('/api/search')),
  // headers and signal pass through
  typed(({ fetch }) =>
    fetch('/api/usage', { headers: { 'X-Mode': 'x' }, signal: AbortSignal.timeout(1000) }),
  ),
  // a method the file exports (a body by its schema), GET when left out
  typed(({ fetch }) => fetch('/api/settings', { method: 'GET' })),
  typed(async ({ fetch }) =>
    exactly<{ saved: boolean }>()(
      await fetch('/api/settings', { method: 'POST', body: { emails: false } }),
    ),
  ),
  typed(({ fetch }) =>
    fetch('/api/settings', { method: 'POST', body: { emails: false, theme: 'dark' } }),
  ),
  // a body whose fields are all optional may be left out
  typed(({ fetch }) => fetch('/api/settings', { method: 'PATCH' })),
  typed(({ fetch }) => fetch('/api/settings', { method: 'PATCH', body: { theme: 'dark' } })),
  // @ts-expect-error the schema requires emails: the body is required
  typed(({ fetch }) => fetch('/api/settings', { method: 'POST' })),
  // @ts-expect-error a required field is missing
  typed(({ fetch }) => fetch('/api/settings', { method: 'POST', body: { theme: 'dark' } })),
  // @ts-expect-error a field of the wrong type
  typed(({ fetch }) => fetch('/api/settings', { method: 'POST', body: { emails: 'no' } })),
  // @ts-expect-error a method the file doesn't export
  typed(({ fetch }) => fetch('/api/settings', { method: 'DELETE' })),
  // @ts-expect-error a body is for a method other than GET
  typed(({ fetch }) => fetch('/api/settings', { body: { emails: false } })),
  // @ts-expect-error a body is for a method other than GET
  typed(({ fetch }) => fetch('/api/usage', { body: {} })),
  // a file with POST only: the method is required
  typed(({ fetch }) => fetch('/api/tokens', { method: 'POST', body: { name: 'ci' } })),
  // @ts-expect-error no GET: the method is required
  typed(({ fetch }) => fetch('/api/tokens', { body: { name: 'ci' } })),
  // @ts-expect-error no GET: the method is required
  typed(({ fetch }) => fetch('/api/tokens')),
  // @ts-expect-error not a route's method: POST only
  typed(({ fetch }) => fetch('/api/tokens', { method: 'PUT', body: { name: 'ci' } })),
  // a page's data is its props: its pattern is not a path
  // @ts-expect-error a page
  typed(({ fetch }) => fetch('/')),
  // @ts-expect-error a page with params
  typed(({ fetch }) => fetch('/users/:id', { id: 7 })),
  // @ts-expect-error a page's loader
  typed(({ fetch }) => fetch('/search', { query: { q: 'ada' } })),
  // @ts-expect-error a page's action
  typed(({ fetch }) => fetch('/users/:id?rename', { id: 7 })),
  // @ts-expect-error not a route
  typed(({ fetch }) => fetch('/api/nothing')),
  // not c.json: unknown (text; a redirect or back(); a branch that isn't json)
  typed(async ({ fetch }) => exactly<unknown>()(await fetch('/api/hello'))),
  typed(async ({ fetch }) => exactly<unknown>()(await fetch('/api/redirect'))),
  typed(async ({ fetch }) =>
    exactly<unknown>()(await fetch('/api/redirect', { method: 'POST', body: {} })),
  ),
  typed(async ({ fetch }) => exactly<unknown>()(await fetch('/api/maybe'))),
  // a handler without a validator or with one that throws: the json (a throw is not an answer)
  typed(async ({ fetch }) => exactly<{ ok: boolean }>()(await fetch('/api/throws'))),
  // a handler with two json answers: either
  typed(async ({ fetch }) => exactly<{ a: number } | { b: string }>()(await fetch('/api/outcome'))),
  // a route written without the generated types: anything goes (see the loose case in fetch.test.ts)
  // the registry's own handlers keep their schemas for href() (the answer is not part of them)
  typed(({ href }) => href('/api/users/:id', { id: 7 })),
]

// withValidator keeps what its handler returns: for fetch()'s answer, and every handler it accepted before
const answers = [
  typed(({ defineHandler }) => {
    const handler = defineHandler.withValidator({ params })((c, { params }) => c.json(params.id))
    const accepted: Validated<{ params: typeof params }> = handler
    return accepted
  }),
  // a redirect, back(), a text, a body: any Response
  typed(({ defineHandler }, c) => defineHandler.withValidator({ params })(() => c.redirect('/'))),
  typed(({ defineHandler }, c) => defineHandler.withValidator({ params })(() => back(c))),
  typed(({ defineHandler }) => defineHandler.withValidator({ params })((c) => c.text('x'))),
  typed(({ defineHandler }) =>
    defineHandler.withValidator({ params })(async (c) => c.json({ a: 1 })),
  ),
  // with middleware first
  typed(({ defineHandler }) =>
    defineHandler.withValidator({ params })(
      async (_, next) => next(),
      (c) => c.json({ a: 1 }),
    ),
  ),
  // @ts-expect-error a handler answers with a Response
  typed(({ defineHandler }) => defineHandler.withValidator({ params })(() => 'x')),
]

test('the types above are checked by tsc', () => {
  expect([
    ...renders,
    ...hrefs,
    ...shared,
    ...validated,
    ...fetches,
    ...answers,
    ...navigation,
  ]).toHaveLength(117)
})
