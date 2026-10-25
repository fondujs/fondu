import { href } from 'fondu/client'

const titles: Record<number, string> = {
  403: 'Forbidden',
  404: 'Page not found',
  500: 'Something went wrong',
}

// 404, 500…: rendered by Fondu with the status (in development, a 500 shows the error report
// instead)
export default function ErrorPage({ status }: { status: number }) {
  const title = titles[status] ?? 'Error'
  return (
    <>
      <title>{`${title} · Fondu`}</title>
      <h1>{title}</h1>
      <p className="text-muted">
        Status {status}. <a href={href('/')}>Go home</a>
      </p>
    </>
  )
}
