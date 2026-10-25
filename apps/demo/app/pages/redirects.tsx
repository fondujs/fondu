import { href } from 'fondu/client'

import { DemoCard, Title } from '#/components/demo.tsx'
import { Button } from '#/components/ui/button.tsx'

const Action = ({ to, label, id }: { to: string; label: string; id: string }) => (
  <form action={to} method="post">
    <Button type="submit" data-testid={id}>
      {label}
    </Button>
  </form>
)

export default function Redirects({ visitedAt }: { visitedAt: string }) {
  return (
    <>
      <Title>Redirects</Title>
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
            A navigation to <code>/props</code>, no page load; the flash message travels in a
            cookie.
          </p>
          <Action to={href('/redirects?props')} label="Redirect to /props" id="to-props" />
        </DemoCard>
        <DemoCard title="Not a page" tag="location(c, url)">
          <p className="mb-4 text-muted-foreground">
            409 with <code>X-Fondu-Location</code>: the browser loads <code>/api/health</code> as a
            document (another site works the same way).
          </p>
          <Action to={href('/redirects?external')} label="Load /api/health" id="external" />
        </DemoCard>
      </div>
    </>
  )
}
