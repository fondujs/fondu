import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const contacts = sqliteTable('contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
})

export type Contact = typeof contacts.$inferSelect
