import { eq } from 'drizzle-orm'
import { defineHandler } from 'fondu'
import * as z from 'zod/mini'

import { db } from '#/db/index.server.ts'
import { contacts } from '#/db/schema/index.ts'
import { requireApiUser } from '#/lib/api.server.ts'

const params = z.object({ id: z.coerce.number().check(z.int()) })

export const GET = defineHandler.withValidator({ params })(requireApiUser, async (c, { params }) => {
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, params.id))
  return contact ? c.json({ contact }) : c.json({ error: 'Not found' }, 404)
})

export const DELETE = defineHandler.withValidator({ params })(requireApiUser, async (c, { params }) => {
  await db.delete(contacts).where(eq(contacts.id, params.id))
  return c.body(null, 204)
})
