import { back, defineHandler, flash, render } from 'fondu'
import { desc, eq } from 'drizzle-orm'
import * as z from 'zod/mini'
import { db } from '../../db/index.server'
import { contacts } from '../../db/schema'
import { contactSchema } from '../../schemas/contact'

export const loader = defineHandler((c) => render(c, 'contacts/index', { contacts: () => db.select().from(contacts).orderBy(desc(contacts.id)) }))

// POST /contacts — invalid: 303 back with the errors; with `Precognition: true` (live validation) only validated
export const action = defineHandler.withValidator({ body: contactSchema })(async (c, { body }) => {
  await db.insert(contacts).values(body)
  flash(c, { message: `Added ${body.name}` })
  return back(c)
})

export const actions = {
  // POST /contacts?delete
  delete: defineHandler.withValidator({ body: z.object({ id: z.coerce.number().check(z.int()) }) })(async (c, { body }) => {
    await db.delete(contacts).where(eq(contacts.id, body.id))
    flash(c, { message: 'Contact deleted' })
    return back(c)
  }),
}
