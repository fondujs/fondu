import { Form, Head } from '@inertiajs/react'
import { href } from 'fondu/client'

import { Card } from '#/components/ui.tsx'

const Action = ({ to, label, id }: { to: string; label: string; id: string }) => (
  <Form action={to} method="post">
    <button className="btn btn-primary" data-testid={id}>
      {label}
    </button>
  </Form>
)

export default function Redirects({ visitedAt }: { visitedAt: string }) {
  return (
    <>
      <Head title="Redirects" />
      <h1>Redirects</h1>
      <p className="lede">
        Actions answer with redirects. This page was rendered at{' '}
        <span className="font-mono" data-testid="visited-at">
          {visitedAt}
        </span>
        .
      </p>
      <div className="grid-cards">
        <Card title="Back" tag="back(c)">
          <p className="note mb-3">303 to the page the request came from (its Referer), with a flash message.</p>
          <Action to={href('/redirects?back')} label="Redirect back" id="back" />
        </Card>
        <Card title="Another page" tag="c.redirect(url, 303)">
          <p className="note mb-3">
            An Inertia visit to <code>/props</code>; the flash message travels in a cookie.
          </p>
          <Action to={href('/redirects?props')} label="Redirect to /props" id="to-props" />
        </Card>
        <Card title="With a fragment" tag="409 X-Inertia-Redirect">
          <p className="note mb-3">
            The browser's <code>fetch</code> drops <code>#target</code> when it follows a redirect, so the server tells
            the client to visit it.
          </p>
          <Action to={href('/redirects?fragment')} label="Redirect to #target" id="fragment" />
        </Card>
        <Card title="Not an Inertia page" tag="location(c, url)">
          <p className="note mb-3">
            409 with <code>X-Inertia-Location</code>: the browser loads <code>/api/health</code> as a document (another
            site works the same way).
          </p>
          <Action to={href('/redirects?external')} label="Load /api/health" id="external" />
        </Card>
      </div>
      <div className="h-[110vh]" />
      <Card title="#target" className="scroll-mt-6">
        <p id="target" className="note" data-testid="target">
          The fragment redirect scrolled here.
        </p>
      </Card>
    </>
  )
}
