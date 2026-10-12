import { Head, Link } from '@inertiajs/react'
import { href } from 'fondu/client'

const messages: Record<number, [title: string, text: string]> = {
  403: ['Not allowed', 'This page is for other accounts.'],
  404: ['Page not found', 'There is nothing at this address.'],
  500: ['Something went wrong', 'The error was logged on the server. Try again in a moment.'],
  503: ['Down for maintenance', 'Back shortly.'],
}

// The error page: Fondu renders it for 404 / 403 / 500… with the status, inside the layout (shared props included)
export default function ErrorPage({ status }: { status: number }) {
  const [title, text] = messages[status] ?? ['Something went wrong', 'Try again in a moment.']
  return (
    <>
      <Head title={title} />
      <p className="mb-2 font-mono text-[13px] text-accent" data-testid="error-status">{status}</p>
      <h1>{title}</h1>
      <p className="lede">{text} <Link href={href('/')}>Go to the overview</Link>.</p>
    </>
  )
}
