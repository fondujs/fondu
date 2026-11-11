import { count } from 'drizzle-orm'
import { defineHandler } from 'fondu'

import { db } from '#/db/index.server.ts'
import { contacts } from '#/db/schema/index.ts'
import { requireApiUser } from '#/modules/auth/api.server.ts'

// GET /api/usage: the settings dialog's usage tab calls it with fetch() (components/settings-dialog.tsx), typed by
// this file: `since` is a Date here and a string there, as JSON delivers it. Guests: 401 JSON.
export const GET = defineHandler(requireApiUser, async (c) => {
  const [{ total }] = await db.select({ total: count() }).from(contacts)
  return c.json({ contacts: total, since: c.get('user')!.createdAt })
})
