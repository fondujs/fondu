import { defineHandler, render } from 'fondu'
import { HTTPException } from 'hono/http-exception'
import * as z from 'zod/mini'

import { getTodo } from '#/lib/todos.server.ts'

// GET /todos/:id — `params.id` is a number (the schema coerces it); an unknown id: the error page, status 404
export const loader = defineHandler.withValidator({ params: z.object({ id: z.coerce.number() }) })((c, { params }) => {
  const todo = getTodo(params.id)
  if (!todo) throw new HTTPException(404)
  return render(c, 'todos/show', { todo })
})
