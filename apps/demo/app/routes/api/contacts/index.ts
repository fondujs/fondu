import { desc } from 'drizzle-orm'
import { defineHandler } from 'fondu'

import { db } from '#/db/index.server.ts'
import { contacts } from '#/db/schema/index.ts'
import { requireApiUser } from '#/lib/api.server.ts'
import { contactSchema } from '#/schemas/contact.ts'

// signed-in users only (guests: 401 JSON); invalid input: 422 { errors }
export const GET = defineHandler(requireApiUser, async (c) => {
  await new Promise((r) => setTimeout(r, 500)) // makes the loading state visible
  return c.json({ contacts: await db.select().from(contacts).orderBy(desc(contacts.id)) })
})

export const POST = defineHandler.withValidator({ body: contactSchema })(requireApiUser, async (c, { body }) => {
  const [contact] = await db.insert(contacts).values(body).returning()
  return c.json({ contact }, 201)
})
