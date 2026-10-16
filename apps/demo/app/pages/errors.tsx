import { Form, Head, Link } from '@inertiajs/react'
import { href } from 'fondu/client'

import { DemoCard } from '#/components/demo.tsx'
import { Button } from '#/components/ui/button.tsx'

const cases: Array<[url: string, label: string, what: string]> = [
  ['/nope', 'An unknown URL', '404'],
  ['/errors/forbidden', 'HTTPException(403)', '403'],
  ['/errors/loader', 'A loader that throws', '500'],
  ['/errors/missing', 'A page that does not exist', '500'],
]

const Status = ({ children }: { children: string }) => (
  <span className="font-mono text-xs text-muted-foreground">{children}</span>
)

export default function Errors() {
  return (
    <>
      <Head title="Errors" />
      <h1>Errors</h1>
      <p className="lede">
        Fondu answers unknown URLs and thrown errors itself. A 404 or 403 renders{' '}
        <code>pages/error.tsx</code> with the status. A 500 in development is a report of the error
        (during a visit, Inertia shows it in its dialog); in production it is the same error page
        with status 500. API clients get plain text.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <DemoCard title="During a visit" tag="<Link>">
          <ul className="grid gap-2">
            {cases.map(([url, label, status]) => (
              <li key={url}>
                <Link href={url} data-testid={`visit-${status}-${url.split('/').pop()}`}>
                  {label}
                </Link>{' '}
                <Status>{status}</Status>
              </li>
            ))}
          </ul>
          <Form action={href('/errors?fail')} method="post" className="mt-4">
            <Button type="submit" variant="outline" data-testid="action-fail">
              An action that throws
            </Button>
          </Form>
        </DemoCard>
        <DemoCard title="As a document load" tag="<a>">
          <ul className="grid gap-2">
            {cases.map(([url, label, status]) => (
              <li key={url}>
                <a href={url}>{label}</a> <Status>{status}</Status>
              </li>
            ))}
          </ul>
        </DemoCard>
      </div>
    </>
  )
}
