import { Meta } from '#/components/meta.tsx'

const messages: Record<number, [title: string, text: string]> = {
  404: ['Page not found', 'There is nothing at this address.'],
  500: ['Something went wrong', 'Try again in a moment.'],
}

// The error page: a URL of no page (404), or an error in the Worker
export default function ErrorPage({ status }: { status: number }) {
  const [title, text] = messages[status] ?? messages[500]!
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 sm:px-6">
      <Meta title={title} noindex />
      <p className="mb-2 font-mono text-sm text-muted-foreground">{status}</p>
      <h1>{title}</h1>
      <p className="lede">
        {text} <a href="/docs">Read the docs</a> or go to the <a href="/">home page</a>.
      </p>
    </div>
  )
}
