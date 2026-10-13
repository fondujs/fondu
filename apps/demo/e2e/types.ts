import { defineHandler, flash, render, share } from 'fondu'
import { href } from 'fondu/client'
// Type checks (run by `tsc --noEmit`): each @ts-expect-error must be an error, the rest must compile.
import type { Context } from 'hono'
import * as z from 'zod/mini'

declare const c: Context

// ---- href(): only patterns of app/routes/, and one of a file's actions; params required
const urls: string[] = [
  href('/'),
  href('/contacts'),
  href('/contacts/:id', { id: 7 }),
  href('/contacts?delete'),
  href('/contacts/:id?rename', { id: 7 }),
  href('/api/contacts/:id', { id: 7 }),
]
// @ts-expect-error no such route
href('/nope')
// @ts-expect-error params are required
href('/contacts/:id')
// @ts-expect-error wrong param name
href('/contacts/:id', { slug: 7 })
// @ts-expect-error no such action
href('/contacts?nope')
// @ts-expect-error /props takes no params
href('/props', { id: 1 })

// ---- render(): only pages of app/pages/, props checked against the component's own
void render(c, 'contacts/show', { contact: { id: 1, name: 'Ada', email: 'a@x.org' } })
void render(c, 'routes')
void render(c, 'contacts/index', { contacts: () => Promise.resolve([]) }) // a function: called only when sent
// @ts-expect-error no such page
void render(c, 'nope')
// @ts-expect-error a required prop is missing
void render(c, 'contacts/show', {})
// @ts-expect-error a prop of the wrong type
void render(c, 'contacts/show', { contact: { id: 'x', name: 'Ada', email: 'a@x.org' } })
// @ts-expect-error a prop the page does not take
void render(c, 'routes', { extra: 1 })

// ---- shared props and flash: typed by Inertia's own InertiaConfig (routes/_middleware.ts)
share(c, { auth: { user: { name: 'Ada', email: 'ada@x.org', role: 'user' } } })
// @ts-expect-error name is a string
share(c, { auth: { user: { name: 1, email: 'ada@x.org', role: 'user' } } })
flash(c, { message: 'Saved' })
// @ts-expect-error message is a string
flash(c, { message: 1 })

// ---- c.get(): typed by Hono's ContextVariableMap (routes/_middleware.ts)
const name: string | undefined = c.get('user')?.name
void name

// ---- withValidator: the handler's input is the schemas' output
defineHandler.withValidator({ params: z.object({ id: z.coerce.number() }), body: z.object({ name: z.string() }) })(
  (ctx, { params, body }) => {
    const id: number = params.id
    // @ts-expect-error not in the schema
    void body.email
    return ctx.json({ id, name: body.name, urls })
  },
)
