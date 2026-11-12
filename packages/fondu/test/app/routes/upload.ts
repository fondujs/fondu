import { defineHandler } from 'fondu'

// the body limit by path (`_middleware.ts`): the size it got
export const POST = defineHandler(async (c) =>
  c.text(String((await c.req.arrayBuffer()).byteLength)),
)
