import { count } from 'drizzle-orm'
import { defineHandler } from 'fondu'

import { db } from '#/db/index.server.ts'
import { contacts } from '#/db/schema/index.ts'
import { requireApiUser } from '#/modules/auth/api.server.ts'

// `since` is a Date here and a string in the dialog, as JSON delivers it.
export const GET = defineHandler(requireApiUser, async (c) => {
  const [{ total }] = await db.select({ total: count() }).from(contacts)
  return c.json({ contacts: total, since: c.get('user')!.createdAt })
})
