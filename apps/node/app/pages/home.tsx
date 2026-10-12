import { Form, Head, Link } from '@inertiajs/react'
import { href } from 'fondu/client'
import type { Todo } from '../lib/todos.server'

export default function Home({ todos }: { todos: Todo[] }) {
  return (
    <>
      <Head title="Todos" />
      <h1>Todos</h1>
      <ul>
        {todos.map((t) => <li key={t.id}><Link href={href('/todos/:id', { id: t.id })}>{t.title}</Link></li>)}
      </ul>
      <Form action={href('/')} method="post" resetOnSuccess>
        {({ errors, processing }) => (
          <>
            <input name="title" placeholder="What needs doing?" aria-label="Title" />
            <button disabled={processing}>Add</button>
            {errors.title && <p className="error">{errors.title}</p>}
          </>
        )}
      </Form>
    </>
  )
}
