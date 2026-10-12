import { Head, Link } from '@inertiajs/react'
import { href } from 'fondu/client'
import type { Todo } from '../../lib/todos.server'

export default function Show({ todo }: { todo: Todo }) {
  return (
    <>
      <Head title={todo.title} />
      <h1>{todo.title}</h1>
      <p>Added {new Date(todo.createdAt).toLocaleString('en')}</p>
      <Link href={href('/')}>← All todos</Link>
    </>
  )
}
