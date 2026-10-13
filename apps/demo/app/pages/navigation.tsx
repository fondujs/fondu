import { Head, Link, useRemember } from '@inertiajs/react'
import { href } from 'fondu/client'
import { useState } from 'react'

import { Card } from '#/components/ui.tsx'

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
      <div className="grid-cards">
        <Card title="Prefetch" tag="<Link prefetch>">
          <p className="note mb-3">Fetched on hover; the click renders at once. The sidebar prefetches every demo.</p>
          <Link href={href('/props')} prefetch="hover" className="btn" data-testid="prefetch">
            Props (prefetched on hover)
          </Link>
        </Card>
        <Card title="View transitions" tag="<Link viewTransition>">
          <p className="note mb-3">
            The page swap runs inside <code>document.startViewTransition()</code>.
          </p>
          <Link href={href('/routes')} viewTransition className="btn" data-testid="vt">
            Routes, with a transition
          </Link>
        </Card>
        <Card title="Preserve state" tag="preserveState">
          <p className="note mb-3">
            Reload this page's props without resetting its React state: clicks:{' '}
            <span data-testid="clicks">{clicks}</span>.
          </p>
          <div className="flex gap-2">
            <button className="btn" onClick={() => setClicks((n) => n + 1)} data-testid="click">
              Click
            </button>
            <Link href={href('/navigation')} preserveState className="btn" data-testid="preserve">
              Visit, keep state
            </Link>
            <Link href={href('/navigation')} className="btn" data-testid="reset-state">
              Visit
            </Link>
          </div>
        </Card>
        <Card title="Remembered input" tag="useRemember">
          <input
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Type, leave, press Back"
            data-testid="note"
          />
        </Card>
      </div>
    </>
  )
}
