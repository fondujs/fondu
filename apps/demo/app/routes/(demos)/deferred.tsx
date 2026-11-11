import { defer, defineHandler, render } from 'fondu'
import { Deferred, reload, useNavigation } from 'fondu/client'
import { useEffect, useRef } from 'react'

import { DemoCard, Title } from '#/components/demo.tsx'
import { Button } from '#/components/ui/button.tsx'

type Stats = { visits: number; computedAt: string }

// `stats` is a second request's: the page is sent without it, and the browser asks for it once the page is shown
export const loader = defineHandler((c) =>
  render(c, DeferredDemo, {
    servedAt: new Date().toISOString().slice(11, 23),
    stats: defer(async () => {
      await new Promise((r) => setTimeout(r, 600)) // a slow query
      return {
        visits: Math.floor(Math.random() * 1000),
        computedAt: new Date().toISOString().slice(11, 23),
      }
    }),
    // a function that throws is logged on the server and left out: the page shows its `failed` content
    broken: defer((): string => {
      throw new Error('the query failed')
    }),
  }),
)

export default function DeferredDemo({
  servedAt,
  stats,
}: {
  servedAt: string
  stats?: Stats
  broken?: string
}) {
  const { state } = useNavigation()
  // a request for deferred props is quiet: once this page is shown (a navigation to it ends as it mounts),
  // useNavigation() is never anything but idle
  // (written to the DOM: React renders the text once and leaves it alone)
  const busy = useRef<HTMLSpanElement>(null)
  const idled = useRef(false)
  useEffect(() => {
    if (state === 'idle') idled.current = true
    else if (idled.current && busy.current) busy.current.textContent = 'yes'
  }, [state])
  return (
    <>
      <Title>Deferred props</Title>
      <h1>Deferred props</h1>
      <p className="lede">
        The page renders at once, without the props marked <code>defer()</code>; once it is on the
        screen the client asks for them with a second request, and <code>&lt;Deferred&gt;</code>{' '}
        shows a fallback until they are there. Served at{' '}
        <span className="font-mono" data-testid="served-at">
          {servedAt}
        </span>
        .
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <DemoCard title="A slow prop" tag="defer(), <Deferred>">
          <Deferred
            data="stats"
            fallback={
              <p className="text-muted-foreground" data-testid="stats-fallback">
                Loading the stats…
              </p>
            }
          >
            <p data-testid="stats">
              <span data-testid="visits">{stats?.visits}</span> visits, computed at{' '}
              <span className="font-mono" data-testid="computed-at">
                {stats?.computedAt}
              </span>
            </p>
          </Deferred>
          <p className="mt-3 text-muted-foreground">
            A navigation state seen meanwhile:{' '}
            <span data-testid="busy" ref={busy}>
              no
            </span>
          </p>
        </DemoCard>
        <DemoCard title="Ask again" tag="reload({ only })">
          <p className="mb-4 text-muted-foreground">
            Only the props named: the stats change, the time above does not.
          </p>
          <Button
            variant="outline"
            onClick={() => reload({ only: ['stats'] })}
            data-testid="refresh"
          >
            Refresh the stats
          </Button>
        </DemoCard>
        <DemoCard title="A function that throws" tag="failed">
          <Deferred
            data="broken"
            fallback={<p className="text-muted-foreground">Loading…</p>}
            failed={<p data-testid="broken-failed">It failed: the rest of the page is fine.</p>}
          >
            <p>never shown</p>
          </Deferred>
        </DemoCard>
      </div>
    </>
  )
}
