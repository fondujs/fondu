import { defineHandler } from 'fondu'
import * as z from 'zod/mini'

export const GET = defineHandler((c) => c.json({ ok: true }))
export const POST = defineHandler.withValidator({ body: z.object({ n: z.number() }) })((c, { body }) =>
  c.json({ n: body.n }, 201),
)
