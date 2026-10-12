import { defineConfig } from 'drizzle-kit'

// `bun run db:generate`: SQL migrations from app/db/schema/, applied by `wrangler d1 migrations apply`.
export default defineConfig({
  dialect: 'sqlite',
  schema: './app/db/schema/index.ts',
  out: './migrations',
})
