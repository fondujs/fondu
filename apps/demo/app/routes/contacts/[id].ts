import { eq } from 'drizzle-orm'
import { back, defineHandler, flash, render, ValidationError } from 'fondu'
import { HTTPException } from 'hono/http-exception'
import * as z from 'zod/mini'

import { db } from '#/db/index.server.ts'
import { contacts } from '#/db/schema/index.ts'
import { requireUser } from '#/lib/auth.server.ts'
import { EMAIL_TAKEN, emailFree } from '#/lib/contacts.server.ts'
import { contactSchema } from '#/schemas/contact.ts'

const params = z.object({ id: z.coerce.number().check(z.int()) })

// GET /contacts/:id — `params.id` is a number; /contacts/abc is a 404
export const loader = defineHandler.withValidator({ params })(async (c, { params }) => {
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, params.id))
  if (!contact) throw new HTTPException(404)
  return render(c, 'contacts/show', { contact })
})

// the changes are for signed-in users, like adding and deleting
export const actions = {
  // POST /contacts/:id?rename — its errors arrive in the `rename` error bag (the form sends X-Inertia-Error-Bag)
  rename: defineHandler.withValidator({
    params,
    body: z.object({
      name: z.string().check(z.trim(), z.minLength(2, 'Name must be at least 2 characters')),
    }),
  })(requireUser, async (c, { params, body }) => {
    await db.update(contacts).set(body).where(eq(contacts.id, params.id))
    flash(c, { message: 'Renamed' })
    return back(c)
  }),
  // POST /contacts/:id?email — the `email` bag
  email: defineHandler.withValidator({
    params,
    body: z.object({ email: contactSchema.shape.email }),
  })(requireUser, async (c, { params, body }) => {
    if (!(await emailFree(body.email, params.id))) throw new ValidationError({ email: EMAIL_TAKEN })
    await db.update(contacts).set(body).where(eq(contacts.id, params.id))
    flash(c, { message: 'Email changed' })
    return back(c)
  }),
}
