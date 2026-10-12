import { Head } from '@inertiajs/react'

// The page's props are what the loader (app/routes/index.ts) passed to render()
export default function Index({ greeting, path }: { greeting: string; path: string }) {
  return (
    <>
      <Head title="Home" />
      <h1>{greeting}</h1>
      <p className="text-muted">
        This page is <code>app/pages/index.tsx</code>, rendered by the loader in <code>app/routes/index.ts</code> for{' '}
        <code>{path}</code>. Add a route file, and its page: the file path is the URL.
      </p>
    </>
  )
}
