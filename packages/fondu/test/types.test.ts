// The public types, as an app with its own declarations sees them (type checks: `tsc`; each @ts-expect-error must
// be an error): render() by the page component, href() by the routes, share() and flash() by Register's shared and flash,
// withValidator() by its schemas. CONTRIBUTING: "Types are behavior".
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { expect, test } from 'vitest'
import * as z from 'zod/mini'

import type {
  closeShallow,
  request,
  href,
  navigate,
  useForm,
  useNavigation,
  usePage,
} from '../src/client.js'
// @ts-expect-error the plumbing types are not exported
import type { AnswerOf, ApiPath, RequestArgs } from '../src/client.js'
// @ts-expect-error ProgressOptions is fondu/vite's
import type { ProgressOptions as ClientProgressOptions } from '../src/client.js'
// @ts-expect-error StandardSchemaV1 is not exported
import type { StandardSchemaV1 } from '../src/index.js'
import type { flash } from '../src/server/flash.js'
import {
  defineHandler as define,
  type defineHandler,
  type Validated,
} from '../src/server/handler.js'
import { back } from '../src/server/http.js'
import type { defer, render, share } from '../src/server/protocol.js'
import type { FonduOptions, ProgressOptions } from '../src/vite/index.js'

type Auth = { user: string | null }
const searchQuery = z.object({ q: z.string(), page: z.optional(z.coerce.number()) })
const listQuery = z.object({ sort: z.optional(z.enum(['name', 'date'])) })
const filterQuery = z.object({
  tag: z.array(z.string()),
  user: z.optional(z.object({ name: z.string() })),
})
// the route files request() calls: their handlers, as `typeof import('./app/routes/…')` has them
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
    shared: { auth: Auth; mode: 'text' | 'count' }
    flash: { message?: string }
    routes: {
      '/': object
      '/about': object
      '/:lang/about': object
      '/users/:id': { actions: { rename: unknown; delete: unknown } }
      '/files/:path*': object
      '/users/:id/files/:path*': { actions: { remove: unknown } }
      '/search': { loader: Validated<{ query: typeof searchQuery }> }
      '/teams/:id': {
        loader: Validated<{ query: typeof listQuery }>
        actions: { invite: Validated<{ query: typeof searchQuery }> }
      }
      '/filter': { loader: Validated<{ query: typeof filterQuery }> }
      '/api/items': { GET: Validated<{ query: typeof listQuery }> }
      '/api/usage': { GET: typeof getUsage }
      '/api/clock': { GET: typeof getClock }
      '/api/users/:id': { GET: typeof getUser }
      '/api/search': { GET: typeof getSearch }
      '/api/files/:path*': { GET: typeof getText }
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
  navigate: typeof navigate
  closeShallow: typeof closeShallow
  request: typeof request
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

type Result = { kind: 'hit'; title: string } | { kind: 'miss'; reason: string }
declare function SearchResult(props: Result & { auth: Auth }): null
declare const result: Result
declare function OptionalResult(props: { kind?: 'empty' } | Result): null

type Stats = { total: number }
declare function Dashboard(props: { title: string; stats?: Stats; at?: string }): null
declare function Maybe(props: { stats: Stats | undefined }): null
declare function Dated(props: { when?: Date }): null

const renders = [
  typed(({ render }, c) => render(c, SearchResult, { kind: 'hit', title: 'Found' })),
  typed(({ render }, c) =>
    render(c, SearchResult, { kind: 'miss', reason: 'Gone' }, { status: 404 }),
  ),
  typed(({ render }, c) => render(c, SearchResult, result)),
  // @ts-expect-error the hit branch needs its title
  typed(({ render }, c) => render(c, SearchResult, { kind: 'hit' })),
  // @ts-expect-error the miss branch needs its reason, even with a status
  typed(({ render }, c) => render(c, SearchResult, { kind: 'miss' }, { status: 404 })),
  // @ts-expect-error reason belongs to the miss branch, not hit
  typed(({ render }, c) => render(c, SearchResult, { kind: 'hit', reason: 'Gone' })),
  // Omitting props is valid only when at least one complete branch accepts {}.
  typed(({ render }, c) => render(c, OptionalResult)),
  // @ts-expect-error neither branch takes an empty object
  typed(({ render }, c) => render(c, SearchResult)),
  // @ts-expect-error the empty branch cannot supply a missing title for a hit
  typed(({ render }, c) => render(c, OptionalResult, { kind: 'hit' })),
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

declare function Pair(props: { pair: [string, number]; auth: Auth }): null
declare function Lists(props: {
  optional: readonly [string, number?]
  rest: [string, ...number[]]
  tags: string[]
}): null

// Type-checked at the render call, never run: JSON inputs keep tuple positions and lengths (#295).
typed(({ render }, c) => {
  const pair = ['Ada', 1] as const
  render(c, Pair, { pair })
  render(c, Pair, { pair: [new Date(), 1] }) // the first slot receives a string
  render(c, Pair, { pair: { toJSON: (): [string, number] => ['Ada', 1] } })
  // @ts-expect-error a pair cannot be empty
  render(c, Pair, { pair: [] })
  // @ts-expect-error the second slot is required
  render(c, Pair, { pair: ['Ada'] })
  // @ts-expect-error there is no third slot
  render(c, Pair, { pair: ['Ada', 1, 2] })
  // @ts-expect-error both values are present, but in the wrong positions
  render(c, Pair, { pair: [1, 'Ada'] })

  const tags: readonly string[] = ['green']
  render(c, Lists, { optional: ['Ada'], rest: ['Ada'], tags: [] })
  render(c, Lists, { optional: pair, rest: ['Ada', 1, 2], tags })
  // @ts-expect-error the readonly tuple's first slot is still required
  render(c, Lists, { optional: [], rest: ['Ada'], tags })
  // @ts-expect-error elements after the first must be numbers
  render(c, Lists, { optional: pair, rest: ['Ada', 'extra'], tags })
})

type IndexedHit = { kind: 'hit'; title: string; [key: string]: unknown }
declare function IndexedResult(props: IndexedHit | { kind: 'miss'; reason: string }): null
declare function Dictionary(props: Record<string, string>): null

type ModeResult = { mode: 'text'; value: string } | { mode: 'count'; value: number }
declare function SharedMode(props: ModeResult): null
declare const sharedModeResult: ModeResult
declare function Summary(
  p:
    | { kind: 'text-view'; mode: 'text'; body: string }
    | { kind: 'summary'; mode: string; summary: number },
): null
declare function DetailedAuth(props: { auth: Auth & { team?: string } }): null
declare function OptionalSharedMode(props: { mode?: 'text' } | { mode: 'count' }): null
declare function InvalidSharedMode(props: ModeResult | { mode: 'other'; value: boolean }): null

typed(({ render }, c) => {
  render(c, IndexedResult, { kind: 'hit', title: 'Found', extra: 1 })
  render(c, IndexedResult, { kind: 'miss', reason: 'Gone' })
  // @ts-expect-error an index signature doesn't supply an explicitly required title
  render(c, IndexedResult, { kind: 'hit' })
  // @ts-expect-error extra fields don't make the discriminant arbitrary
  render(c, IndexedResult, { kind: 'other', title: 'Found' })
  // @ts-expect-error the index signature doesn't make either branch empty
  render(c, IndexedResult)
  render(c, Dictionary)
  render(c, Dictionary, { section: 'news' })

  render(c, SharedMode, { mode: 'text', value: 'Hello' })
  render(c, SharedMode, { mode: 'count', value: 2 }, { status: 202 })
  render(c, SharedMode, sharedModeResult)
  render(c, Summary, { kind: 'summary', summary: 4 })
  render(c, Summary, { kind: 'summary', mode: 'count', summary: 4 })
  // @ts-expect-error the page accepts any string, but layouts accept only 'text' | 'count'
  render(c, Summary, { kind: 'summary', mode: 'other', summary: 4 })
  render(c, DetailedAuth, { auth: { user: null, team: 'Editors' } })
  const wrongTeam = { user: null, team: 12 }
  // @ts-expect-error the override must satisfy the page too, including optional fields it adds
  render(c, DetailedAuth, { auth: wrongTeam })
  // @ts-expect-error middleware may provide either mode, not necessarily count
  render(c, SharedMode, { value: 2 })
  // @ts-expect-error the mode and value must agree
  render(c, SharedMode, { mode: 'count', value: 'Hello' })
  render(c, OptionalSharedMode, { mode: 'text' })
  // @ts-expect-error even the text branch needs a mode; middleware could give it count
  render(c, OptionalSharedMode)
  // @ts-expect-error a page may not overwrite a shared value with one layouts cannot handle
  render(c, InvalidSharedMode, { mode: 'other', value: true })
})

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
  typed(({ href }) => href('/files/:path*', { path: 'a/b' })),
  // @ts-expect-error the old key, Hono's regex, is no route
  typed(({ href }) => href('/files/:path{.+}', { path: 'a/b' })),
  // a param before a catch-all: each its own name, with an action too
  typed(({ href }) => href('/users/:id/files/:path*', { id: 7, path: 'a/b' })),
  typed(({ href }) => href('/users/:id/files/:path*?remove', { id: 7, path: 'a/b' })),
  // @ts-expect-error the param before the catch-all is missing
  typed(({ href }) => href('/users/:id/files/:path*', { path: 'a/b' })),
  // @ts-expect-error the catch-all is missing
  typed(({ href }) => href('/users/:id/files/:path*', { id: 7 })),
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
  // lists and nested objects, as href() writes them (`tag[]=a`, `user[name]=Ada`): with no schema, any depth
  typed(({ href }) => href('/', { query: { tag: ['a'] } })),
  typed(({ href }) => href('/', { query: { tag: [] } })),
  typed(({ href }) => href('/', { query: { user: { name: 'Ada', tags: ['x'], age: 7 } } })),
  typed(({ href }) => href('/', { query: { rows: [{ a: 1 }, { a: 2 }], grid: [['a'], ['b']] } })),
  // a coerced field (any input) takes them too
  typed(({ href }) => href('/search', { query: { q: 'ada', page: [1, 2] } })),
  // a schema's own types stay: its list, its object
  typed(({ href }) => href('/filter', { query: { tag: ['a', 'b'] } })),
  typed(({ href }) => href('/filter', { query: { tag: ['a'], user: { name: 'Ada' } } })),
  // @ts-expect-error a list the schema takes as strings
  typed(({ href }) => href('/filter', { query: { tag: [1] } })),
  // @ts-expect-error a plain value where the schema takes a list
  typed(({ href }) => href('/filter', { query: { tag: 'a' } })),
  // @ts-expect-error an object missing the schema's field
  typed(({ href }) => href('/filter', { query: { tag: [], user: {} } })),
  // @ts-expect-error a function is no query value
  typed(({ href }) => href('/', { query: { f: () => 1 } })),
  // @ts-expect-error nor a Date (write its string: `date.toISOString()`)
  typed(({ href }) => href('/', { query: { at: new Date() } })),
  // @ts-expect-error nor a function inside a list or an object
  typed(({ href }) => href('/', { query: { user: { f: () => 1 }, tag: [Symbol('x')] } })),
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

// navigate(): replace, keep and shallow are optional booleans; shallow: true takes no keep, no transition
const flags = { shallow: Math.random() > 0.5, keep: Math.random() > 0.5 }
const navigations = [
  typed(({ navigate }) => navigate('/x')),
  typed(({ navigate }) => navigate('/x', { keep: true })),
  typed(({ navigate }) => navigate('/x', { replace: true, keep: true })),
  // @ts-expect-error keep is a boolean
  typed(({ navigate }) => navigate('/x', { keep: 'yes' })),
  typed(({ navigate }) => navigate('?a=1', { shallow: true })),
  typed(({ navigate }) => navigate('?a=1', { shallow: true, replace: true })),
  typed(({ navigate }) => navigate('?a=1', { shallow: false, keep: true, replace: true })),
  typed(({ navigate }) => navigate('?a=1', { shallow: undefined, keep: true })),
  // @ts-expect-error shallow is a boolean
  typed(({ navigate }) => navigate('?a=1', { shallow: 'yes' })),
  // @ts-expect-error a shallow navigation keeps the page anyway: no keep
  typed(({ navigate }) => navigate('?a=1', { shallow: true, keep: true })),
  // @ts-expect-error not even keep: false
  typed(({ navigate }) => navigate('?a=1', { shallow: true, keep: false })),
  // a boolean that may be true is not the shallow branch, nor the other one with a keep
  // @ts-expect-error shallow may be true: keep is not allowed
  typed(({ navigate }) => navigate('?a=1', { shallow: flags.shallow, keep: true })),
  // @ts-expect-error both may be true
  typed(({ navigate }) => navigate('?a=1', { shallow: flags.shallow, keep: flags.keep })),
  // @ts-expect-error keep may be true: shallow may not be
  typed(({ navigate }) => navigate('?a=1', { shallow: true, keep: flags.keep })),
  typed(({ navigate }) => navigate('?a=1', { shallow: flags.shallow })),
  // transition: true, false, or the custom types the view transition adds; a shallow navigation never has one
  typed(({ navigate }) => navigate('/x', { transition: true })),
  typed(({ navigate }) => navigate('/x', { transition: false })),
  typed(({ navigate }) => navigate('/x', { transition: ['zoom'] })),
  typed(({ navigate }) => navigate('/x', { transition: ['zoom', 'fade'] })),
  typed(({ navigate }) => navigate('/x', { transition: [] })),
  typed(({ navigate }) => navigate('/x', { transition: undefined })),
  typed(({ navigate }) => navigate('/x', { replace: true, keep: true, transition: ['zoom'] })),
  typed(({ navigate }) => navigate('/x', { shallow: false, transition: true })),
  // @ts-expect-error a list of types, or a boolean: not a string
  typed(({ navigate }) => navigate('/x', { transition: 'zoom' })),
  // @ts-expect-error the types are strings
  typed(({ navigate }) => navigate('/x', { transition: [1] })),
  // @ts-expect-error a shallow navigation never transitions
  typed(({ navigate }) => navigate('?a=1', { shallow: true, transition: true })),
  // @ts-expect-error not even false
  typed(({ navigate }) => navigate('?a=1', { shallow: true, transition: false })),
  // @ts-expect-error shallow may be true
  typed(({ navigate }) => navigate('?a=1', { shallow: flags.shallow, transition: ['zoom'] })),
  typed(({ closeShallow }) => closeShallow('/x')),
  typed(({ closeShallow }) => closeShallow('/x?tab=a#b')),
  // @ts-expect-error the URL to fall back to is required
  typed(({ closeShallow }) => closeShallow()),
  // @ts-expect-error a URL, not options
  typed(({ closeShallow }) => closeShallow({ replace: true })),
  typed(({ closeShallow }) => {
    const done: void = closeShallow('/x')
    // @ts-expect-error it returns nothing
    const string: string = closeShallow('/x')
    return [done, string]
  }),
]

// is the type exactly T (both ways: `any` and a wider type are not)
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const exactly =
  <T>() =>
  <A>(value: A, ..._: Equal<A, T> extends true ? [] : [error: 'not the same type']) =>
    value

// fondu/client's public values are exactly the documented list (apps/site/app/routes/docs/api.mdx), without the
// internals (`__entry`, `renderPage`: fondu/client/internal) or the old names (`fetch`, `FetchError`)
test('fondu/client exports exactly the documented values', () => {
  const names = null as unknown as keyof typeof import('../src/client.js')
  exactly<
    | 'href'
    | 'usePage'
    | 'useNavigation'
    | 'useForm'
    | 'reload'
    | 'Deferred'
    | 'navigate'
    | 'closeShallow'
    | 'loadDocument'
    | 'request'
    | 'RequestError'
  >()(names)
  exactly<'__entry' | 'renderPage'>()(
    null as unknown as keyof typeof import('../src/client/internal.js'),
  )
})

type ClockWithDate = { at: Date; nested: { when: string }; n: number }
// request(): a `.ts` route's answer as JSON delivers it, by the route file's own types
const requests = [
  typed(async ({ request }) =>
    exactly<{ used: number; limit: number }>()(await request('/api/usage')),
  ),
  // a Date arrives as a string, nested too; an undefined field is dropped
  typed(async ({ request }) =>
    exactly<{ at: string; nested: { when: string }; n: number }>()(await request('/api/clock')),
  ),
  // @ts-expect-error a Date is not what arrives
  typed(async ({ request }) => exactly<ClockWithDate>()(await request('/api/clock'))),
  // params, as href() takes them; the handler's answer (a validated one, params and query)
  typed(async ({ request }) =>
    exactly<{ id: number; name: string }>()(await request('/api/users/:id', { id: 7 })),
  ),
  typed(({ request }) => request('/api/users/:id', { id: '7' })),
  // a catch-all, keyed as href() has it
  typed(({ request }) => request('/api/files/:path*', { path: 'a/b' })),
  // @ts-expect-error the old key
  typed(({ request }) => request('/api/files/:path{.+}', { path: 'a/b' })),
  // @ts-expect-error the param is missing
  typed(({ request }) => request('/api/users/:id')),
  // @ts-expect-error the param is missing
  typed(({ request }) => request('/api/users/:id', { query: { sort: 'name' } })),
  // @ts-expect-error a param named otherwise
  typed(({ request }) => request('/api/users/:id', { slug: 7 })),
  // @ts-expect-error a route without params takes none
  typed(({ request }) => request('/api/usage', { id: 7 })),
  // a query, by the schema of the method (optional or required fields)
  typed(({ request }) => request('/api/users/:id', { id: 7, query: { sort: 'name' } })),
  typed(({ request }) => request('/api/search', { query: { q: 'ada', page: 2 } })),
  typed(async ({ request }) =>
    exactly<{ found: string[] }>()(await request('/api/search', { query: { q: 'ada' } })),
  ),
  // @ts-expect-error a value the schema doesn't take
  typed(({ request }) => request('/api/users/:id', { id: 7, query: { sort: 'size' } })),
  // @ts-expect-error a field of the wrong type
  typed(({ request }) => request('/api/search', { query: { q: 1 } })),
  // @ts-expect-error the schema requires q: the query is required
  typed(({ request }) => request('/api/search')),
  // headers and signal pass through
  typed(({ request }) =>
    request('/api/usage', { headers: { 'X-Mode': 'x' }, signal: AbortSignal.timeout(1000) }),
  ),
  // a method the file exports (a body by its schema), GET when left out
  typed(({ request }) => request('/api/settings', { method: 'GET' })),
  typed(async ({ request }) =>
    exactly<{ saved: boolean }>()(
      await request('/api/settings', { method: 'POST', body: { emails: false } }),
    ),
  ),
  typed(({ request }) =>
    request('/api/settings', { method: 'POST', body: { emails: false, theme: 'dark' } }),
  ),
  // a body whose fields are all optional may be left out
  typed(({ request }) => request('/api/settings', { method: 'PATCH' })),
  typed(({ request }) => request('/api/settings', { method: 'PATCH', body: { theme: 'dark' } })),
  // @ts-expect-error the schema requires emails: the body is required
  typed(({ request }) => request('/api/settings', { method: 'POST' })),
  // @ts-expect-error a required field is missing
  typed(({ request }) => request('/api/settings', { method: 'POST', body: { theme: 'dark' } })),
  // @ts-expect-error a field of the wrong type
  typed(({ request }) => request('/api/settings', { method: 'POST', body: { emails: 'no' } })),
  // @ts-expect-error a method the file doesn't export
  typed(({ request }) => request('/api/settings', { method: 'DELETE' })),
  // @ts-expect-error a body is for a method other than GET
  typed(({ request }) => request('/api/settings', { body: { emails: false } })),
  // @ts-expect-error a body is for a method other than GET
  typed(({ request }) => request('/api/usage', { body: {} })),
  // a file with POST only: the method is required
  typed(({ request }) => request('/api/tokens', { method: 'POST', body: { name: 'ci' } })),
  // @ts-expect-error no GET: the method is required
  typed(({ request }) => request('/api/tokens', { body: { name: 'ci' } })),
  // @ts-expect-error no GET: the method is required
  typed(({ request }) => request('/api/tokens')),
  // @ts-expect-error no GET, the generic names POST: the method is still required
  typed(({ request }) => request<'/api/tokens', 'POST'>('/api/tokens', { body: { name: 'ci' } })),
  // @ts-expect-error not a route's method: POST only
  typed(({ request }) => request('/api/tokens', { method: 'PUT', body: { name: 'ci' } })),
  // omitted is GET: a generic that names another method (or a union) names it in the options too
  typed(({ request }) =>
    // @ts-expect-error POST in the generic, no method: it would send a GET
    request<'/api/settings', 'POST'>('/api/settings', { body: { emails: false } }),
  ),
  // @ts-expect-error PATCH in the generic, no options: it would send a GET
  typed(({ request }) => request<'/api/settings', 'PATCH'>('/api/settings')),
  // @ts-expect-error a union generic: no method to tell which
  typed(({ request }) => request<'/api/settings', 'GET' | 'POST'>('/api/settings')),
  typed(({ request }) =>
    // @ts-expect-error a union generic of the non-GET methods: no method to tell which
    request<'/api/settings', 'POST' | 'PATCH'>('/api/settings', { headers: {} }),
  ),
  typed(({ request }) =>
    request<'/api/settings', 'POST'>('/api/settings', { method: 'POST', body: { emails: false } }),
  ),
  typed(async ({ request }) =>
    exactly<{ saved: boolean }>()(
      await request<'/api/settings', 'POST'>('/api/settings', {
        method: 'POST',
        body: { emails: false },
      }),
    ),
  ),
  // GET stays the default: inferred, or named, with no method
  typed(({ request }) => request('/api/settings')),
  typed(({ request }) => request<'/api/settings', 'GET'>('/api/settings')),
  typed(({ request }) => request<'/api/settings', 'GET'>('/api/settings', { method: 'GET' })),
  // a page's data is its props: its pattern is not a path
  // @ts-expect-error a page
  typed(({ request }) => request('/')),
  // @ts-expect-error a page with params
  typed(({ request }) => request('/users/:id', { id: 7 })),
  // @ts-expect-error a page's loader
  typed(({ request }) => request('/search', { query: { q: 'ada' } })),
  // @ts-expect-error a page's action
  typed(({ request }) => request('/users/:id?rename', { id: 7 })),
  // @ts-expect-error not a route
  typed(({ request }) => request('/api/nothing')),
  // not c.json: unknown (text; a redirect or back(); a branch that isn't json)
  typed(async ({ request }) => exactly<unknown>()(await request('/api/hello'))),
  typed(async ({ request }) => exactly<unknown>()(await request('/api/redirect'))),
  typed(async ({ request }) =>
    exactly<unknown>()(await request('/api/redirect', { method: 'POST', body: {} })),
  ),
  typed(async ({ request }) => exactly<unknown>()(await request('/api/maybe'))),
  // a handler without a validator or with one that throws: the json (a throw is not an answer)
  typed(async ({ request }) => exactly<{ ok: boolean }>()(await request('/api/throws'))),
  // a handler with two json answers: either
  typed(async ({ request }) =>
    exactly<{ a: number } | { b: string }>()(await request('/api/outcome')),
  ),
  // a route written without the generated types: anything goes (see the loose case in request.test.ts)
  // the registry's own handlers keep their schemas for href() (the answer is not part of them)
  typed(({ href }) => href('/api/users/:id', { id: 7 })),
]

// withValidator keeps what its handler returns: for request()'s answer, and every handler it accepted before
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
    ...requests,
    ...answers,
    ...navigation,
    ...navigations,
  ]).toHaveLength(185)
})

test('FonduOptions: the port is PORT, not an option', () => {
  const options: FonduOptions[] = [
    { target: 'node' },
    { target: 'bun', ssr: false, prerender: true },
    // @ts-expect-error `port` was removed: the server listens on PORT
    { target: 'node', port: 8080 },
  ]
  expect(options).toHaveLength(3)
})

test('ProgressOptions is the type of the progress option', () => {
  const progress: ProgressOptions = { color: 'red', delay: 100 }
  const options: FonduOptions = { target: 'node', progress }
  expect(options.progress).toBe(progress)
  // the unexported types are named only to check that importing them fails
  type Unused = [
    AnswerOf<'', ''>,
    ApiPath,
    RequestArgs<'', 'GET'>,
    ClientProgressOptions,
    StandardSchemaV1,
  ]
  expect<Unused | undefined>(undefined).toBeUndefined()
})

test('FonduOptions: viewTransitions is true or false', () => {
  const options: FonduOptions[] = [
    { target: 'node' },
    { target: 'node', viewTransitions: true },
    { target: 'cloudflare', viewTransitions: false, prerender: true, progress: false },
    // @ts-expect-error a boolean, not a string
    { target: 'node', viewTransitions: 'yes' },
  ]
  expect(options).toHaveLength(4)
})
