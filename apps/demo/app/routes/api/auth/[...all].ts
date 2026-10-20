import { defineHandler } from 'fondu'

import { auth } from '#/modules/auth/auth.server.ts'

// Better Auth's own HTTP API (/api/auth/*): for its client, OAuth callbacks…
export const GET = defineHandler((c) => auth.handler(c.req.raw))
export const POST = defineHandler((c) => auth.handler(c.req.raw))
