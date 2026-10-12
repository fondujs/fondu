import { Form, Head, Link } from '@inertiajs/react'
import { href } from 'fondu/client'

import type { Todo } from '#/lib/todos.server.ts'

export default function Home({ todos }: { todos: Todo[] }) {
  return (
    <>
      <Head title="Todos" />
      <h1>Todos</h1>
      <ul className="card divide-y divide-line py-0">
        {todos.map((t) => (
          <li key={t.id} className="py-2.5">
            <Link href={href('/todos/:id', { id: t.id })} className="no-underline">
              {t.title}
            </Link>
          </li>
        ))}
      </ul>
      <Form action={href('/')} method="post" resetOnSuccess className="mt-4 grid gap-1.5">
        {({ errors, processing }) => (
          <>
            <div className="flex gap-2">
              <input
                className="input"
                name="title"
                placeholder="What needs doing?"
                aria-label="Title"
                aria-invalid={errors.title ? true : undefined}
              />
              <button className="btn" disabled={processing}>
                Add
              </button>
            </div>
            {errors.title && <p className="err">{errors.title}</p>}
          </>
        )}
      </Form>
    </>
  )
}
