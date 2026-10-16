import { and, eq, ne } from 'drizzle-orm'
import * as z from 'zod/mini'

import { db } from '#/db/index.server.ts'
import { contacts } from '#/db/schema/index.ts'
import { contactSchema } from '#/schemas/contact.ts'

export const EMAIL_TAKEN = 'Already in your contacts'

/** No other contact has this address: the message for what the unique index on `contacts.email` guarantees */
export async function emailFree(email: string, except?: number) {
  const [taken] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(eq(contacts.email, email), except === undefined ? undefined : ne(contacts.id, except)),
    )
    .limit(1)
  return !taken
}

/** A new contact: the shared schema, and on the server a new address (live validation checks it too) */
export const newContactSchema = z.extend(contactSchema, {
  email: contactSchema.shape.email.check(z.refine((email) => emailFree(email), EMAIL_TAKEN)),
})
