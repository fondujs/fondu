import { defineHandler } from 'fondu'
import { HTTPException } from 'hono/http-exception'

export const GET = defineHandler(() => {
  throw new HTTPException(403)
})
