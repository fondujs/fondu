import { defineHandler } from 'fondu'
import { HTTPException } from 'hono/http-exception'

export const loader = defineHandler(() => { throw new HTTPException(403) })
