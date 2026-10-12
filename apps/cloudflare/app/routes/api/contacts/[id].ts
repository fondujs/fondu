import { defineHandler } from 'fondu'
import { eq } from 'drizzle-orm'
import * as z from 'zod/mini'
import { db } from '../../../db/index.server'
import { contacts } from '../../../db/schema'
import { requireApiUser } from '../../../lib/api.server'

const params = z.object({ id: z.coerce.number().check(z.int()) })

export const GET = defineHandler.withValidator({ params })(requireApiUser, async (c, { params }) => {
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, params.id))
  return contact ? c.json({ contact }) : c.json({ error: 'Not found' }, 404)
})

export const DELETE = defineHandler.withValidator({ params })(requireApiUser, async (c, { params }) => {
  await db.delete(contacts).where(eq(contacts.id, params.id))
  return c.body(null, 204)
})
