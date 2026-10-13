import { desc, eq } from 'drizzle-orm'
import { back, defineHandler, flash, render } from 'fondu'
import * as z from 'zod/mini'

import { db } from '#/db/index.server.ts'
import { contacts } from '#/db/schema/index.ts'
import { requireUser } from '#/lib/auth.server.ts'
import { newContactSchema } from '#/lib/contacts.server.ts'

export const loader = defineHandler((c) =>
  render(c, 'contacts/index', { contacts: () => db.select().from(contacts).orderBy(desc(contacts.id)) }),
)

// POST /contacts — signed in only; invalid: 303 back with the errors; with `Precognition: true` (live validation)
// only validated
export const action = defineHandler.withValidator({ body: newContactSchema })(requireUser, async (c, { body }) => {
  await db.insert(contacts).values(body)
  flash(c, { message: `Added ${body.name}` })
  return back(c)
})

export const actions = {
  // POST /contacts?delete — signed in only
  delete: defineHandler.withValidator({ body: z.object({ id: z.coerce.number().check(z.int()) }) })(
    requireUser,
    async (c, { body }) => {
      await db.delete(contacts).where(eq(contacts.id, body.id))
      flash(c, { message: 'Contact deleted' })
      return back(c)
    },
  ),
}
