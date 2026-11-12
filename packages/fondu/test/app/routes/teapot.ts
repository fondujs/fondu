import { defineHandler } from 'fondu'
import { HTTPException } from 'hono/http-exception'

// an error whose error page fails too (routes/_error.tsx)
export const GET = defineHandler(() => {
  throw new HTTPException(418)
})
