import { defineHandler } from 'fondu'

import { auth } from '#/modules/auth/auth.server.ts'

export const GET = defineHandler((c) => auth.handler(c.req.raw))
export const POST = defineHandler((c) => auth.handler(c.req.raw))
