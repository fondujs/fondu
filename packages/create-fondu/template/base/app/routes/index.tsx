import { defineHandler, render } from 'fondu'

// GET /: the loader runs on the server, and renders this file's page with these props
export const loader = defineHandler((c) =>
  render(c, Index, { greeting: 'Hello from Fondu', path: c.req.path }),
)

// The page: the only part of a route file the browser gets (loader, action and actions are
// server code, removed from its copy)
export default function Index({ greeting, path }: { greeting: string; path: string }) {
  return (
    <>
      <title>Home · Fondu</title>
      <h1>{greeting}</h1>
      <p className="text-muted">
        This page is <code>app/routes/index.tsx</code>, rendered by its loader for{' '}
        <code>{path}</code>. Add a route file: the file path is the URL.
      </p>
    </>
  )
}
