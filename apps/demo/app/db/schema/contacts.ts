import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// The demo's own data (Forms & validation)
export const contacts = sqliteTable('contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull(),
})

export type Contact = typeof contacts.$inferSelect
