import { back, defineHandler, render } from 'fondu'
import * as z from 'zod/mini'
import { addTodo, listTodos } from '../lib/todos.server'

// GET /
export const loader = defineHandler((c) => render(c, 'home', { todos: listTodos() }))

// POST / — invalid input: back to the page, the errors in its `errors` prop
export const action = defineHandler.withValidator({
  body: z.object({ title: z.string().check(z.trim(), z.minLength(2, 'At least 2 characters')) }),
})((c, { body }) => {
  addTodo(body.title)
  return back(c)
})
