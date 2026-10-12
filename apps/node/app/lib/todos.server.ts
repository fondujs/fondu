// In memory, for the example: a real app keeps them in a database.
export interface Todo { id: number; title: string; createdAt: string }

const todos: Todo[] = [{ id: 1, title: 'Read the Inertia docs', createdAt: new Date().toISOString() }]

export const listTodos = () => todos
export const getTodo = (id: number) => todos.find((t) => t.id === id)
export function addTodo(title: string): Todo {
  const todo = { id: (todos.at(-1)?.id ?? 0) + 1, title, createdAt: new Date().toISOString() }
  todos.push(todo)
  return todo
}
