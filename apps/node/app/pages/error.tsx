import { Head, Link } from '@inertiajs/react'
import { href } from 'fondu/client'

const titles: Record<number, string> = { 403: 'Forbidden', 404: 'Not found', 500: 'Something went wrong' }

// 404, 500…: rendered by Fondu with the status (in development, a 500 shows the error report instead)
export default function ErrorPage({ status }: { status: number }) {
  return (
    <>
      <Head title={titles[status] ?? 'Error'} />
      <h1>{titles[status] ?? 'Error'}</h1>
      <p className="text-muted">
        Status {status}. <Link href={href('/')}>Back to the todos</Link>
      </p>
    </>
  )
}
