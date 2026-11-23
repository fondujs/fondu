// the public types as an app with its own declarations sees them (type checks: `tsc`; each @ts-expect-error must be an
// error). CONTRIBUTING: "Types are behavior".
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { expect, test } from 'vitest'
import * as z from 'zod/mini'

import type {
  closeShallow,
  request,
  href,
  navigate,
  Page,
  reload,
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
import type { AsJson } from '../src/index.js'
import type { flash } from '../src/server/flash.js'
import {
  defineHandler as define,
  type defineHandler,
  type Validated,
} from '../src/server/handler.js'
import { back } from '../src/server/http.js'
import type { render, share } from '../src/server/protocol.js'
import type { Shared } from '../src/types.js'
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
  href: typeof href
  navigate: typeof navigate
  reload: typeof reload
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
  // a page without props, with options: its props are {} whatever is shared
  typed(({ render }, c) => render(c, Bare, {}, { status: 404 })),
  // @ts-expect-error a page without props takes none
  typed(({ render }, c) => render(c, Bare, { title: 'Hello' })),
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
  typed(({ render }, c) => render(c, Errors)),
  // a prop is given as its value: an optional one may be left out
  typed(({ render }, c) => render(c, Dashboard, { title: 'x', stats: { total: 1 } })),
  typed(({ render }, c) => render(c, Dashboard, { title: 'x' })),
  // a promise is no prop's value (the server throws): await it
  typed(({ render }, c) =>
    // @ts-expect-error a promise is not the prop's type
    render(c, Dashboard, { title: 'x', stats: Promise.resolve({ total: 1 }) }),
  ),
  // @ts-expect-error required, though it may be undefined
  typed(({ render }, c) => render(c, Maybe, {})),
]

declare function Pair(props: { pair: [string, number]; auth: Auth }): null
declare function Lists(props: {
  optional: readonly [string, number?]
  rest: [string, ...number[]]
  tags: string[]
}): null

// Type-checked at the render call, never run: JSON inputs keep tuple positions and lengths.
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
declare function ByPresence(props: { body: string } | { mode: 'count'; total: number }): null
declare function OptionalSharedMode(props: { mode?: 'text' } | { mode: 'count' }): null
declare function InvalidSharedMode(props: ModeResult | { mode: 'other'; value: boolean }): null

typed(({ render }, c) => {
  render(c, IndexedResult, { kind: 'hit', title: 'Found', extra: 1 })
  render(c, IndexedResult, { kind: 'hit', title: 'Found', mode: 'count' })
  const badOverride = { kind: 'hit', title: 'Found', mode: 'other' } as const
  // @ts-expect-error a page index signature cannot widen a named shared prop
  render(c, IndexedResult, badOverride)
  render(c, IndexedResult, { kind: 'miss', reason: 'Gone' })
  // @ts-expect-error an index signature doesn't supply an explicitly required title
  render(c, IndexedResult, { kind: 'hit' })
  // @ts-expect-error extra fields don't make the discriminant arbitrary
  render(c, IndexedResult, { kind: 'other', title: 'Found' })
  // @ts-expect-error the index signature doesn't make either branch empty
  render(c, IndexedResult)
  render(c, Dictionary)
  render(c, Dictionary, { section: 'news' })
  render(c, Dictionary, { mode: 'text', section: 'news' })
  // @ts-expect-error explicit dictionary entries must still be valid for layouts
  render(c, Dictionary, { mode: 'other' })

  render(c, ByPresence, { mode: 'count', total: 2 })
  // @ts-expect-error middleware can supply mode: a presence check would read the missing total
  render(c, ByPresence, { body: 'hello' })

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
  typed(({ href }) => href('/users/:id?rename', { id: 7 })),
  // an optional segment: both URLs
  typed(({ href }) => href('/about')),
  typed(({ href }) => href('/:lang/about', { lang: 'de' })),
  // a catch-all, named without its pattern
  typed(({ href }) => href('/files/:path*', { path: 'a/b' })),
  // @ts-expect-error the old key, Hono's regex, is no route
  typed(({ href }) => href('/files/:path{.+}', { path: 'a/b' })),
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
  typed(({ href }) => href('/search', { query: { q: 'ada', page: [1, 2] } })),
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

declare const asyncSchema: {
  '~standard': {
    version: 1
    vendor: string
    validate: (value: unknown) => Promise<{ value: unknown; issues?: undefined }>
  }
}

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
  // a schema is any Standard Schema: its type can't say whether it answers at once (an async one throws when the
  // browser checks it)
  typed(({ useForm }) => useForm(z.object({ name: z.string() }))),
  typed(({ useForm }) => useForm(asyncSchema)),
  // @ts-expect-error not a Standard Schema
  typed(({ useForm }) => useForm({ parse: (value: unknown) => value })),
  typed(({ useForm }) => {
    const { failed, submitting } = useForm()
    const a: boolean = failed
    const b: boolean = submitting
    // @ts-expect-error failed is a boolean
    const c: string = failed
    return [a, b, c]
  }),
]

// reload() takes no argument: the page's props again, all of them
const reloads = [
  typed(({ reload }) => reload()),
  // @ts-expect-error there is no `only`: a prop is not asked for alone
  typed(({ reload }) => reload({ only: ['stats'] })),
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
// internals (`__entry`, `renderPage`)
test('fondu/client exports exactly the documented values', () => {
  const names = null as unknown as keyof typeof import('../src/client.js')
  exactly<
    | 'href'
    | 'usePage'
    | 'useNavigation'
    | 'useForm'
    | 'reload'
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
  typed(({ defineHandler }, c) => defineHandler.withValidator({ params })(() => c.redirect('/'))),
  typed(({ defineHandler }, c) => defineHandler.withValidator({ params })(() => back(c))),
  typed(({ defineHandler }) => defineHandler.withValidator({ params })((c) => c.text('x'))),
  typed(({ defineHandler }) =>
    defineHandler.withValidator({ params })(async (c) => c.json({ a: 1 })),
  ),
  typed(({ defineHandler }) =>
    defineHandler.withValidator({ params })(
      async (_, next) => next(),
      (c) => c.json({ a: 1 }),
    ),
  ),
  // @ts-expect-error a handler answers with a Response
  typed(({ defineHandler }) => defineHandler.withValidator({ params })(() => 'x')),
]

test('a page prop that clashes with a shared prop names the cause', () => {
  expect(clashes).toHaveLength(9)
})

test('Page<P> is what usePage<P>() returns', () => {
  expect(pageTypes).toHaveLength(6)
})

test('the types above are checked by tsc', () => {
  expect([
    ...renders,
    ...hrefs,
    ...shared,
    ...validated,
    ...requests,
    ...answers,
    ...navigation,
    ...reloads,
    ...navigations,
  ]).toHaveLength(183)
})

test('FonduOptions: the port is PORT, not an option; server rendering is turned off by withoutSsr()', () => {
  const options: FonduOptions[] = [
    { target: 'node' },
    { target: 'bun', viewTransitions: true },
    // @ts-expect-error `port` was removed: the server listens on PORT
    { target: 'node', port: 8080 },
    // @ts-expect-error `ssr` was removed: `withoutSsr()` in the root _middleware.ts
    { target: 'node', ssr: false },
  ]
  expect(options).toHaveLength(4)
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
    { target: 'cloudflare', viewTransitions: false, progress: false },
    // @ts-expect-error a boolean, not a string
    { target: 'node', viewTransitions: 'yes' },
  ]
  expect(options).toHaveLength(4)
})

// AsJson<T>: T as a page receives it. Two sides, tested together: the mapping, and its pairing with render(), the input
// side: what render() accepts for a prop of type AsJson<X> is X, and nothing whose JSON is not AsJson<X>.
const same = <A, B>(..._: Equal<A, B> extends true ? [] : [error: { got: A; want: B }]) => true

const clashMessage = 'fondu: this page prop has the name of a shared prop (share()); rename it'
declare function ClashObject(props: { auth: string }): null
declare function ClashNumber(props: { auth: number; title: string }): null
declare function ClashLiteral(props: { mode: 'other' }): null
declare function ClashOptional(props: { auth?: string }): null
declare function ClashBranch(
  props: { mode: 'other'; body: string } | { mode: 'count'; total: number },
): null
type RenderProps<P extends object> = Parameters<typeof render<P>>[2]
const clashes = [
  same<RenderProps<{ auth: string }>['auth'], typeof clashMessage>(),
  same<RenderProps<{ auth: number; title: string }>['auth'], typeof clashMessage>(),
  same<RenderProps<{ mode: 'other' }>['mode'], typeof clashMessage>(),
  same<RenderProps<{ auth?: string }>['auth'], typeof clashMessage>(),
  // @ts-expect-error
  typed(({ render }, c) => render(c, ClashObject, { auth: 'Ada' })),
  // @ts-expect-error
  typed(({ render }, c) => render(c, ClashNumber, { auth: 1, title: 'x' })),
  // @ts-expect-error
  typed(({ render }, c) => render(c, ClashLiteral, { mode: 'other' })),
  // @ts-expect-error
  typed(({ render }, c) => render(c, ClashOptional, { auth: 'Ada' })),
  // @ts-expect-error
  typed(({ render }, c) => render(c, ClashBranch, { mode: 'other', body: 'x' })),
]

type Own = { title: string; count?: number }
const pageTypes = [
  same<ReturnType<typeof usePage<Shared>>, Page>(),
  same<ReturnType<typeof usePage<Own>>, Page<Own>>(),
  same<ReturnType<typeof usePage<{}>>, Page<{}>>(),
  same<
    Page<Own>,
    {
      component: string
      props: Own & { errors: Record<string, string> }
      url: string
      flash: { message?: string }
    }
  >(),
  same<Page['props']['auth'], Auth>(),
  // @ts-expect-error
  typed(({ usePage }) => usePage().version),
]

const asJson = [
  // Date, or anything with toJSON(): what it gives. JSON calls it once: the result's own toJSON() is not called
  same<AsJson<Date>, string>(),
  same<AsJson<{ at: Date; n: number }>, { at: string; n: number }>(),
  same<AsJson<{ toJSON(): { at: Date; n: number } }>, { at: string; n: number }>(),
  same<AsJson<{ toJSON(): Date }>, {}>(),
  same<AsJson<{ toJSON(): undefined }>, undefined>(),
  same<AsJson<{ toJSON(): { toJSON(): string } }>, {}>(),
  same<AsJson<{ id: bigint; toJSON(): { id: string } }>, { id: string }>(),
  same<AsJson<Date | null>, string | null>(),
  // undefined properties are optional (nothing, if only undefined); undefined in an array is null
  same<AsJson<{ a: string | undefined; b?: number; c: undefined }>, { a?: string; b?: number }>(),
  same<AsJson<{ a?: Date }>, { a?: string }>(),
  same<AsJson<(string | undefined)[]>, (string | null)[]>(),
  same<AsJson<[string, undefined, Date]>, [string, null, string]>(),
  same<AsJson<[string, number?]>, [string, (number | null)?]>(),
  same<AsJson<readonly (Date | undefined)[]>, readonly (string | null)[]>(),
  // functions and symbols: left out of an object (a symbol key too), null in an array
  same<AsJson<{ a: 1; f: () => void; s: symbol; [k: symbol]: string }>, { a: 1 }>(),
  same<AsJson<{ a: string | (() => void) }>, { a?: string }>(),
  same<AsJson<{ save(x: Date): void }>, {}>(),
  same<AsJson<(() => void)[]>, null[]>(),
  same<AsJson<[symbol, string]>, [null, string]>(),
  same<AsJson<(string | symbol)[]>, (string | null)[]>(),
  // Map, Set and the rest with no own data: {}
  same<AsJson<{ m: Map<string, Date>; s: Set<string> }>, { m: {}; s: {} }>(),
  same<AsJson<WeakMap<object, number>>, {}>(),
  same<AsJson<WeakSet<object>>, {}>(),
  same<AsJson<RegExp>, {}>(),
  same<AsJson<Promise<number>>, {}>(),
  same<AsJson<Map<string, number>[]>, {}[]>(),
  same<
    AsJson<{ k: 'a'; at: Date } | { k: 'b'; n?: number }>,
    { k: 'a'; at: string } | { k: 'b'; n?: number }
  >(),
  same<AsJson<string | number | null>, string | number | null>(),
  same<AsJson<readonly string[]>, readonly string[]>(),
  same<AsJson<[string, ...number[]]>, [string, ...number[]]>(),
  same<AsJson<readonly [Date, number?]>, readonly [string, (number | null)?]>(),
  same<AsJson<[]>, []>(),
  same<AsJson<{ readonly a: Date; b?: Date }>, { readonly a: string; b?: string }>(),
  // edge inputs: an index signature, never, {}, any, unknown, a brand, a recursive type
  same<AsJson<Record<string, Date | undefined>>, { [k: string]: string }>(),
  same<
    AsJson<{ [k: `data-${string}`]: Date; id: number }>,
    { [k: `data-${string}`]: string; id: number }
  >(),
  same<AsJson<never>, never>(),
  same<AsJson<{ a: never }>, {}>(),
  same<AsJson<{}>, {}>(),
  // oxlint-disable-next-line no-explicit-any -- any stays any
  same<AsJson<{ a: any }>, { a?: any }>(),
  same<AsJson<{ a: unknown }>, { a?: unknown }>(),
  same<AsJson<string & { __brand: 'id' }>, string & { __brand: 'id' }>(),
  same<AsJson<Folder>['kids'][number]['kids'][number]['madeAt'], string>(),
  // @ts-expect-error `same` has teeth: a Date is a string, not a number
  same<AsJson<Date>, number>(),
]
type Folder = { name: string; madeAt: Date; kids: Folder[] }

// bigint is an error, as JSON.stringify throws on one: anywhere in the value, but not where JSON doesn't get to it
// @ts-expect-error a bigint
type BigId = AsJson<bigint>
// @ts-expect-error in an object
type BigRow = AsJson<{ id: bigint; name: string }>
// @ts-expect-error in a union, which a string would absorb if the error were a string
type BigOrString = AsJson<string | bigint>
// @ts-expect-error nested in an array in an object
type BigNested = AsJson<{ rows: { total: bigint }[] }>
// @ts-expect-error a bigint literal
type BigLiteral = AsJson<{ big: 1n }>
// @ts-expect-error toJSON() gives a bigint
type BigFromJson = AsJson<{ toJSON(): bigint }>
// toJSON() replaces it; a function is left out
type BigIgnored = [AsJson<{ big: bigint; toJSON(): number }>, AsJson<{ f(n: bigint): void }>]

type Contact = {
  id: number
  name: string
  email: string | null
  createdAt: Date
  seenAt?: Date
  meta: { tags: string[]; visited: (Date | undefined)[] } | null
}
type ContactJson = {
  id: number
  name: string
  email: string | null
  createdAt: string
  seenAt?: string
  meta: { tags: string[]; visited: (string | null)[] } | null
}
declare const contact: Contact
declare const contacts: Contact[]
declare const readonlyContacts: readonly Contact[]
declare function ContactList(props: { contacts: AsJson<Contact[]>; auth: Auth }): null
declare function ContactCard(props: { contact: AsJson<Contact> | null }): null
declare function LazyContacts(props: { contacts?: AsJson<Contact[]>; total: number }): null
declare function ByQuery(props: { found: AsJson<Awaited<ReturnType<typeof listContacts>>> }): null
declare const listContacts: () => Promise<
  { id: number; createdAt: Date; note: string | undefined; run: () => void }[]
>
declare const listed: Awaited<ReturnType<typeof listContacts>>
declare function Anything(props: {
  m: AsJson<Map<string, Date>>
  tuple: AsJson<[Date, undefined, () => void]>
  chain: AsJson<{ toJSON(): { at: Date; gone: undefined } }>
}): null
declare const chain: { toJSON(): { at: Date; gone: undefined } }
declare function Strict(props: { rows: AsJson<{ a: string }[]> }): null

// render() accepts X for AsJson<X>: whole, from a query's own type, readonly, as an optional prop, with
// the shared props given or left out, with options
typed(({ render }, c) => {
  render(c, ContactList, { contacts })
  render(c, ContactList, { contacts: readonlyContacts.slice() })
  render(c, ContactList, { contacts: [], auth: { user: null } }, { status: 201 })
  render(c, ContactCard, { contact })
  render(c, ContactCard, { contact: null })
  render(c, LazyContacts, { total: 1 })
  render(c, LazyContacts, { total: 1, contacts })
  render(c, ByQuery, { found: listed })
  render(c, Anything, {
    m: new Map([['a', new Date()]]),
    tuple: [new Date(), undefined, () => {}],
    chain,
  })
  // the page's own type is the JSON one: the string a Date becomes is fine too
  const received: ContactJson = JSON.parse('{}')
  render(c, ContactList, { contacts: [received] })
  // @ts-expect-error a prop of the wrong type
  render(c, ContactList, { contacts: [{ ...contact, id: 'x' }] })
  // @ts-expect-error a column missing
  render(c, ContactList, { contacts: [{ ...contact, name: undefined }] })
  // @ts-expect-error a bare Date is the column's: the list is not
  render(c, ContactList, { contacts: contact.createdAt })
  // @ts-expect-error a page that types the column as a Date still can't be written
  render(c, DatedRow, { contact })
})
declare function DatedRow(props: { contact: Contact }): null

// ... and nothing else: a value whose JSON is not AsJson<X> is an error
typed(({ render }, c) => {
  const slots: (string | undefined)[] = []
  // @ts-expect-error undefined in an array arrives as null: the page types strings
  render(c, Strict, { rows: [{ a: slots[0] }] })
  const calls: { a: string | (() => void) }[] = []
  // @ts-expect-error a function is left out: the page types a as required
  render(c, Strict, { rows: calls })
  const own: { a: string; toJSON(): { b: number } }[] = []
  // @ts-expect-error toJSON() replaces the value: JSON is { b }, not { a }
  render(c, Strict, { rows: own })
  const tupled: [string | undefined][] = []
  // @ts-expect-error a tuple is not the array
  render(c, Strict, { rows: tupled })
})

// a form's values: the schema's type, which is also the action's body
const newContact = z.object({ name: z.string(), email: z.email(), nick: z.optional(z.string()) })
declare function EditContact(props: { values: z.infer<typeof newContact> }): null
typed(({ render, defineHandler }, c) => {
  render(c, EditContact, { values: { name: 'Ada', email: 'ada@example.com' } })
  // @ts-expect-error the schema's type: name is a string
  render(c, EditContact, { values: { name: 1, email: 'ada@example.com' } })
  return defineHandler.withValidator({ body: newContact })((c, { body }) => {
    exactly<z.infer<typeof newContact>>()(body)
    return render(c, EditContact, { values: body })
  })
})

// what a page declares as AsJson<X>, JSON delivers: the value, serialized, is the type (all of the bullets at once)
type Wide = {
  at: Date
  day?: Date
  maybe: string | undefined
  gone: undefined
  fn: () => void
  sym: symbol
  m: Map<string, number>
  s: Set<string>
  slots: (string | undefined | (() => void) | Date)[]
  pair: [Date, undefined]
  stamped: { toJSON(): { at: Date; gone: undefined } }
  hollow: { save(): void }
  note: string | null
}
const wide: Wide = {
  at: new Date(0),
  maybe: undefined,
  gone: undefined,
  fn: () => {},
  sym: Symbol('x'),
  m: new Map([['a', 1]]),
  s: new Set(['a']),
  slots: ['a', undefined, () => {}, new Date(1)],
  pair: [new Date(2), undefined],
  stamped: { toJSON: () => ({ at: new Date(3), gone: undefined }) },
  hollow: { save() {} },
  note: null,
}
const wire: AsJson<Wide> = {
  at: '1970-01-01T00:00:00.000Z',
  m: {},
  s: {},
  slots: ['a', null, null, '1970-01-01T00:00:00.001Z'],
  pair: ['1970-01-01T00:00:00.002Z', null],
  stamped: { at: '1970-01-01T00:00:00.003Z' },
  hollow: {},
  note: null,
}

test('AsJson is the type of the JSON a value becomes', () => {
  expect(JSON.parse(JSON.stringify(wide))).toEqual(wire)
  expect(JSON.stringify({ toJSON: () => new Date(0) })).toBe('{}')
  expect(JSON.stringify({ a: [undefined, () => 1, Symbol('s')], [Symbol('k')]: 1 })).toBe(
    '{"a":[null,null,null]}',
  )
  expect(() => JSON.stringify({ id: 1n })).toThrow(TypeError)
  expect(asJson.every(Boolean)).toBe(true)
  expect(asJson).toHaveLength(43)
  const rest: [BigId, BigRow, BigOrString, BigNested, BigLiteral, BigFromJson, BigIgnored] | null =
    null
  expect(rest).toBeNull()
})
