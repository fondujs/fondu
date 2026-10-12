import { Deferred, Head, usePage } from '@inertiajs/react'
import { useState } from 'react'

import { Card, Json, Skeleton } from '#/components/ui.tsx'

interface Props {
  renderedAt: string
  stats?: { users: number; orders: number; revenue: number }
  flaky?: string
  activity?: string[]
  recommendations?: string[]
}

export default function DeferredDemo({ renderedAt, stats, flaky, activity, recommendations }: Props) {
  const [initial] = useState(usePage().deferredProps)
  return (
    <>
      <Head title="Deferred props" />
      <h1>Deferred props</h1>
      <p className="lede">
        The page rendered at {renderedAt} without waiting for these props. The server announced them in{' '}
        <code>deferredProps</code>, and the client fetched each group in its own request.
      </p>
      <div className="grid-cards mb-4">
        <Card title="stats" tag="group: default · ~0.8s">
          <Deferred data="stats" fallback={<Skeleton />}>
            <dl className="grid grid-cols-3 gap-2 text-center" data-testid="stats">
              {Object.entries(stats ?? {}).map(([k, v]) => (
                <div key={k} className="rounded-md bg-canvas p-2">
                  <dt className="note capitalize">{k}</dt>
                  <dd className="font-mono text-lg">{v.toLocaleString('en')}</dd>
                </div>
              ))}
            </dl>
          </Deferred>
        </Card>
        <Card title="flaky" tag="group: default · rescued">
          <Deferred
            data="flaky"
            fallback={<Skeleton />}
            rescue={
              <p className="rounded-md bg-danger-soft p-3 text-[13px] text-danger" data-testid="rescued">
                This prop failed on the server. Because it uses <code>rescue: true</code>, the error was logged, the
                prop was listed in <code>rescuedProps</code>, and the rest of the response still succeeded.
              </p>
            }
          >
            <p>{flaky}</p>
          </Deferred>
        </Card>
        <Card title="activity" tag="group: slow · ~1.8s">
          <Deferred data="activity" fallback={<Skeleton />}>
            <ul className="grid gap-1 text-[13px]" data-testid="activity">
              {activity?.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </Deferred>
        </Card>
        <Card title="recommendations" tag="group: slow">
          <Deferred data="recommendations" fallback={<Skeleton />}>
            <ul className="list-disc pl-5 text-[13px]" data-testid="recommendations">
              {recommendations?.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </Deferred>
        </Card>
      </div>
      <Card title="Initial deferredProps metadata">
        <Json value={initial} data-testid="deferred-meta" />
      </Card>
    </>
  )
}
