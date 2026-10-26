import { defineHandler } from 'fondu'
import { href } from 'fondu/client'

import { DemoCard, SubmitButton, Title } from '#/components/demo.tsx'

export const actions = {
  // POST /errors?fail
  fail: defineHandler(() => {
    throw new Error('The action failed: the payment service did not answer')
  }),
}

const cases: Array<[url: string, label: string, what: string]> = [
  ['/nope', 'An unknown URL', '404'],
  ['/errors/forbidden', 'HTTPException(403)', '403'],
  ['/errors/loader', 'A loader that throws', '500'],
  ['/errors/proxy', "A proxy's own page", '502'],
]

const Status = ({ children }: { children: string }) => (
  <span className="font-mono text-xs text-muted-foreground">{children}</span>
)

export default function Errors() {
  return (
    <>
      <Title>Errors</Title>
      <h1>Errors</h1>
      <p className="lede">
        Fondu answers unknown URLs and thrown errors itself. A 404 or 403 renders{' '}
        <code>routes/_error.tsx</code> with the status. A 500 in development is a report of the
        error (a navigation loads it as a document); in production it is the same error page with
        status 500. API clients get plain text. An answer that isn't a page, such as a proxy's 502,
        is shown as the browser would show it: a link's loads as a document, a form's replaces the
        page.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <DemoCard title="During a navigation" tag="<a>">
          <ul className="grid gap-2">
            {cases.map(([url, label, status]) => (
              <li key={url}>
                <a href={url} data-testid={`visit-${status}-${url.split('/').pop()}`}>
                  {label}
                </a>{' '}
                <Status>{status}</Status>
              </li>
            ))}
          </ul>
          <form action={href('/errors?fail')} method="post" className="mt-4">
            <SubmitButton variant="outline" data-testid="action-fail">
              An action that throws
            </SubmitButton>
          </form>
          <form action={href('/errors/:kind', { kind: 'proxy' })} method="post" className="mt-4">
            <SubmitButton variant="outline" data-testid="action-proxy">
              A form, a proxy answers
            </SubmitButton>{' '}
            <Status>502</Status>
          </form>
        </DemoCard>
        <DemoCard title="As a document load" tag={'<a target="_blank">'}>
          <ul className="grid gap-2">
            {cases.map(([url, label, status]) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noreferrer">
                  {label}
                </a>{' '}
                <Status>{status}</Status>
              </li>
            ))}
          </ul>
        </DemoCard>
      </div>
    </>
  )
}
