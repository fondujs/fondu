import { back, defineHandler, flash, render } from 'fondu'
import { href } from 'fondu/client'

import { DemoCard, SubmitButton, Title } from '#/components/demo.tsx'

export const loader = defineHandler((c) =>
  render(c, Redirects, { visitedAt: new Date().toISOString().slice(11, 23) }),
)

export const actions = {
  // 303 back to the page the form was on, with a flash message
  back: defineHandler((c) => {
    flash(c, { message: 'Redirected back with a flash message' })
    return back(c)
  }),
  // 303 to another page of this app: a navigation, no page load
  props: defineHandler((c) => {
    flash(c, { message: 'Redirected from /redirects' })
    return c.redirect('/props', 303)
  }),
  // what isn't a page (a file, JSON): the browser loads it; another site too (a navigation gets 409 +
  // X-Fondu-Location: fetch() can't follow it there)
  external: defineHandler((c) => c.redirect('/api/health', 303)),
}

const Action = ({ to, label, id }: { to: string; label: string; id: string }) => (
  <form action={to} method="post">
    <SubmitButton data-testid={id}>{label}</SubmitButton>
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
        <DemoCard title="Not a page" tag="c.redirect(url, 303)">
          <p className="mb-4 text-muted-foreground">
            The answer isn&apos;t a page: the browser loads <code>/api/health</code> as a document.
            Another site works the same way.
          </p>
          <Action to={href('/redirects?external')} label="Load /api/health" id="external" />
        </DemoCard>
      </div>
    </>
  )
}
