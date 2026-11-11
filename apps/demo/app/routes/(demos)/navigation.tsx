import { back, defineHandler, flash, render } from 'fondu'
import { href, reload, useForm, useNavigation } from 'fondu/client'
import { useState } from 'react'
import * as z from 'zod/mini'

import { DemoCard, SubmitButton, TextField, Title } from '#/components/demo.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Button } from '#/components/ui/button.tsx'

// ?slow: answered a second later, to watch useNavigation()
export const loader = defineHandler(async (c) => {
  if (c.req.query('slow') !== undefined) await new Promise((r) => setTimeout(r, 1000))
  return render(c, Navigation, { servedAt: new Date().toISOString().slice(11, 23) })
})

// POST /navigation?note — flashes the note back, shown as a toast
export const actions = {
  note: defineHandler.withValidator({ body: z.object({ note: z.string() }) })((c, { body }) => {
    flash(c, { message: `Sent: ${body.note}` })
    return back(c)
  }),
}

const code = (lines: string[]) => (
  <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs/relaxed">
    {lines.join('\n')}
  </pre>
)

export default function Navigation({ servedAt }: { servedAt: string }) {
  const [clicks, setClicks] = useState(0)
  const { state } = useNavigation()
  const { form, failed } = useForm()
  const navigating = state === 'loading' || state === 'submitting'
  return (
    <>
      <Title>Navigation</Title>
      <h1>Navigation</h1>
      <p className="lede">
        A link or a form is a fetch of the next page as JSON; the page is swapped in place, the
        layout and its state stay mounted, and Back and Forward return where each page was scrolled.
        Served at{' '}
        <span className="font-mono" data-testid="served-at">
          {servedAt}
        </span>
        .
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <DemoCard title="Back and Forward" tag="the server's page, where it was">
          <p className="mb-4 text-muted-foreground">
            Go to another demo and press Back: this page comes from the server again (its time
            changes), scrolled where you left it.
          </p>
          <Button variant="outline" render={<a href={href('/props')} />} data-testid="to-props">
            Props
          </Button>
        </DemoCard>
        <DemoCard title="Pending" tag="useNavigation()">
          <p className="mb-4 text-muted-foreground">
            Loading from the click until the next page is on the screen:{' '}
            <Badge variant={navigating ? 'warning' : 'secondary'} data-testid="navigating">
              {navigating ? 'loading' : 'idle'}
            </Badge>
          </p>
          <Button
            variant="outline"
            render={<a href={href('/navigation', { query: { slow: 1 } })} />}
            data-testid="slow"
          >
            This page, in a second
          </Button>
        </DemoCard>
        <DemoCard title="Preloading" tag="a link's page">
          <p className="text-muted-foreground">
            A page&apos;s code is loaded when the pointer rests on a link (or a touch starts on it),
            before the click; its data is asked for at the click.
          </p>
        </DemoCard>
        <DemoCard title="A form that can't be sent" tag="useForm().failed, useNavigation()">
          <p className="mb-4 text-muted-foreground">
            Go offline in the browser&apos;s tools and send it: the form stays as it was, to send
            again.
          </p>
          <form
            action={href('/navigation?note')}
            method="post"
            className="grid gap-4"
            data-testid="note-form"
            {...form}
          >
            <TextField label="Note" name="note" defaultValue="Hello" />
            <SubmitButton data-testid="send-note">Send</SubmitButton>
            {failed && (
              <p role="alert" data-testid="not-sent">
                Not sent. Check your connection and try again.
              </p>
            )}
          </form>
          <div className="mt-4">
            {code([
              'const { form, failed } = useForm()',
              '',
              '<form action={href(\'/navigation?note\')} method="post" {...form}>',
              '  …',
              '  {failed && <p role="alert">Not sent. Check your connection and try again.</p>}',
              '</form>',
            ])}
          </div>
        </DemoCard>
        <DemoCard title="Keep state" tag="reload()">
          <p className="mb-4 text-muted-foreground">
            The props again, the page&apos;s React state kept: clicks:{' '}
            <span className="text-foreground" data-testid="clicks">
              {clicks}
            </span>
            . A link to this page mounts it anew.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setClicks((n) => n + 1)} data-testid="click">
              Click
            </Button>
            <Button variant="outline" onClick={() => reload()} data-testid="reload">
              Reload, keep state
            </Button>
            <Button
              variant="outline"
              render={<a href={href('/navigation')} />}
              data-testid="reset-state"
            >
              Link here
            </Button>
          </div>
        </DemoCard>
      </div>
    </>
  )
}
