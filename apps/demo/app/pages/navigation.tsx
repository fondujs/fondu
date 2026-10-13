import { Head, Link, useRemember } from '@inertiajs/react'
import { href } from 'fondu/client'
import { useState } from 'react'

import { DemoCard } from '#/components/demo.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'

export default function Navigation({ servedAt }: { servedAt: string }) {
  const [clicks, setClicks] = useState(0)
  const [note, setNote] = useRemember('', 'navigation-note') // kept in history: back here, it is still there
  return (
    <>
      <Head title="Navigation" />
      <h1>Navigation</h1>
      <p className="lede">
        Visits are fetches of the next page's props; the layout and its state stay mounted. Served at{' '}
        <span className="font-mono" data-testid="served-at">
          {servedAt}
        </span>
        .
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <DemoCard title="Prefetch" tag="<Link prefetch>">
          <p className="mb-4 text-muted-foreground">
            Fetched on hover; the click renders at once. The sidebar prefetches every demo.
          </p>
          <Button variant="outline" render={<Link href={href('/props')} prefetch="hover" />} data-testid="prefetch">
            Props (prefetched on hover)
          </Button>
        </DemoCard>
        <DemoCard title="View transitions" tag="<Link viewTransition>">
          <p className="mb-4 text-muted-foreground">
            The page swap runs inside <code>document.startViewTransition()</code>.
          </p>
          <Button variant="outline" render={<Link href={href('/routes')} viewTransition />} data-testid="vt">
            Routes, with a transition
          </Button>
        </DemoCard>
        <DemoCard title="Preserve state" tag="preserveState">
          <p className="mb-4 text-muted-foreground">
            Reload this page's props without resetting its React state: clicks:{' '}
            <span className="text-foreground" data-testid="clicks">
              {clicks}
            </span>
            .
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setClicks((n) => n + 1)} data-testid="click">
              Click
            </Button>
            <Button variant="outline" render={<Link href={href('/navigation')} preserveState />} data-testid="preserve">
              Visit, keep state
            </Button>
            <Button variant="outline" render={<Link href={href('/navigation')} />} data-testid="reset-state">
              Visit
            </Button>
          </div>
        </DemoCard>
        <DemoCard title="Remembered input" tag="useRemember">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Type, leave, press Back"
            aria-label="A note"
            data-testid="note"
          />
        </DemoCard>
      </div>
    </>
  )
}
