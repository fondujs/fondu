import { Form, Head } from '@inertiajs/react'
import { href } from 'fondu/client'

import { DemoCard } from '#/components/demo.tsx'
import { Button } from '#/components/ui/button.tsx'

const Action = ({ to, label, id }: { to: string; label: string; id: string }) => (
  <Form action={to} method="post">
    <Button type="submit" data-testid={id}>
      {label}
    </Button>
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
      <div className="grid gap-4 sm:grid-cols-2">
        <DemoCard title="Back" tag="back(c)">
          <p className="mb-4 text-muted-foreground">
            303 to the page the request came from (its Referer), with a flash message.
          </p>
          <Action to={href('/redirects?back')} label="Redirect back" id="back" />
        </DemoCard>
        <DemoCard title="Another page" tag="c.redirect(url, 303)">
          <p className="mb-4 text-muted-foreground">
            An Inertia visit to <code>/props</code>; the flash message travels in a cookie.
          </p>
          <Action to={href('/redirects?props')} label="Redirect to /props" id="to-props" />
        </DemoCard>
        <DemoCard title="With a fragment" tag="409 X-Inertia-Redirect">
          <p className="mb-4 text-muted-foreground">
            The browser's <code>fetch</code> drops <code>#target</code> when it follows a redirect, so the server tells
            the client to visit it.
          </p>
          <Action to={href('/redirects?fragment')} label="Redirect to #target" id="fragment" />
        </DemoCard>
        <DemoCard title="Not an Inertia page" tag="location(c, url)">
          <p className="mb-4 text-muted-foreground">
            409 with <code>X-Inertia-Location</code>: the browser loads <code>/api/health</code> as a document (another
            site works the same way).
          </p>
          <Action to={href('/redirects?external')} label="Load /api/health" id="external" />
        </DemoCard>
      </div>
      <div className="h-[110vh]" />
      <DemoCard title="#target" className="scroll-mt-6">
        <p id="target" className="text-muted-foreground" data-testid="target">
          The fragment redirect scrolled here.
        </p>
      </DemoCard>
    </>
  )
}
