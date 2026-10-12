// D1 through the binding in wrangler.jsonc, in dev too (the Cloudflare Vite plugin runs workerd).
import { env } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'

export const db = drizzle(env.DB, { schema })
