import { env } from 'cloudflare:workers'

import seed from '../../../migrations/0001_seed.sql?raw'

// children first: sessions and accounts point at users
const tables = ['sessions', 'accounts', 'verifications', 'rate_limits', 'users', 'contacts']

export async function resetDemo() {
  const statements = [
    ...tables.map((table) => `DELETE FROM \`${table}\``),
    `DELETE FROM sqlite_sequence WHERE name = 'contacts'`,
    ...seed
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean),
  ]
  await env.DB.batch(statements.map((sql) => env.DB.prepare(sql)))
}
