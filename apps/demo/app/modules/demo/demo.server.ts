import { env } from 'cloudflare:workers'

import seed from '../../../migrations/0001_seed.sql?raw'

// children first: sessions and accounts point at users
const tables = ['sessions', 'accounts', 'verifications', 'rate_limits', 'users', 'contacts']

/** The demo's data back to the seed: everything deleted, then the seed migration again, in one batch (all or nothing) */
export async function resetDemo() {
  const statements = [
    ...tables.map((table) => `DELETE FROM \`${table}\``),
    `DELETE FROM sqlite_sequence WHERE name = 'contacts'`, // the ids start at 1 again
    ...seed
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean),
  ]
  await env.DB.batch(statements.map((sql) => env.DB.prepare(sql)))
}
