import { back, defineHandler, flash, render } from 'fondu'
import { eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import * as z from 'zod/mini'
import { db } from '../../db/index.server'
import { contacts } from '../../db/schema'

const params = z.object({ id: z.coerce.number().check(z.int()) })

// GET /contacts/:id — `params.id` is a number; /contacts/abc is a 404
export const loader = defineHandler.withValidator({ params })(async (c, { params }) => {
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, params.id))
  if (!contact) throw new HTTPException(404)
  return render(c, 'contacts/show', { contact })
})

export const actions = {
  // POST /contacts/:id?rename — its errors arrive in the `rename` error bag (the form sends X-Inertia-Error-Bag)
  rename: defineHandler.withValidator({ params, body: z.object({ name: z.string().check(z.trim(), z.minLength(2, 'Name must be at least 2 characters')) }) })(async (c, { params, body }) => {
    await db.update(contacts).set(body).where(eq(contacts.id, params.id))
    flash(c, { message: 'Renamed' })
    return back(c)
  }),
  // POST /contacts/:id?email — the `email` bag
  email: defineHandler.withValidator({ params, body: z.object({ email: z.email('Enter a valid email') }) })(async (c, { params, body }) => {
    await db.update(contacts).set(body).where(eq(contacts.id, params.id))
    flash(c, { message: 'Email changed' })
    return back(c)
  }),
}
