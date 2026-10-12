import { defineHandler } from 'fondu'

import { addTodo, listTodos } from '#/lib/todos.server.ts'

// plain HTTP: JSON in and out
export const GET = defineHandler((c) => c.json(listTodos()))
export const POST = defineHandler(async (c) => {
  const { title } = await c.req.json<{ title?: string }>()
  if (!title?.trim()) return c.json({ errors: { title: 'Required' } }, 422)
  return c.json(addTodo(title.trim()), 201)
})
