import { defineHandler } from 'fondu'

export const POST = defineHandler(async (c) =>
  c.text(String((await c.req.arrayBuffer()).byteLength)),
)
