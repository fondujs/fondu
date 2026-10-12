import { Head } from '@inertiajs/react'

export default function About({ runtime }: { runtime: string }) {
  return (
    <>
      <Head title="About" />
      <h1>About</h1>
      <p>Hono and Inertia on <strong data-testid="runtime">{runtime}</strong>, with Fondu: routes in <code>app/routes/</code>, pages in <code>app/pages/</code>.</p>
      <p>The JSON API: <a href="/api/todos">/api/todos</a></p>
    </>
  )
}
