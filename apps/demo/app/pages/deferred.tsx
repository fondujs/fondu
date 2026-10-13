import { Deferred, Head, usePage } from '@inertiajs/react'
import { useState } from 'react'

import { DemoCard, Json, Loading } from '#/components/demo.tsx'

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
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <DemoCard title="stats" tag="group: default · ~0.8s">
          <Deferred data="stats" fallback={<Loading />}>
            <dl className="grid grid-cols-3 gap-2 text-center" data-testid="stats">
              {Object.entries(stats ?? {}).map(([k, v]) => (
                <div key={k} className="rounded-lg bg-muted p-2">
                  <dt className="text-xs text-muted-foreground capitalize">{k}</dt>
                  <dd className="font-mono text-lg">{v.toLocaleString('en')}</dd>
                </div>
              ))}
            </dl>
          </Deferred>
        </DemoCard>
        <DemoCard title="flaky" tag="group: default · rescued">
          <Deferred
            data="flaky"
            fallback={<Loading />}
            rescue={
              <p className="rounded-lg bg-destructive/8 p-3 text-destructive-foreground" data-testid="rescued">
                This prop failed on the server. Because it uses <code>rescue: true</code>, the error was logged, the
                prop was listed in <code>rescuedProps</code>, and the rest of the response still succeeded.
              </p>
            }
          >
            <p>{flaky}</p>
          </Deferred>
        </DemoCard>
        <DemoCard title="activity" tag="group: slow · ~1.8s">
          <Deferred data="activity" fallback={<Loading />}>
            <ul className="grid gap-1" data-testid="activity">
              {activity?.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </Deferred>
        </DemoCard>
        <DemoCard title="recommendations" tag="group: slow">
          <Deferred data="recommendations" fallback={<Loading />}>
            <ul className="list-disc pl-5" data-testid="recommendations">
              {recommendations?.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </Deferred>
        </DemoCard>
      </div>
      <DemoCard title="Initial deferredProps metadata">
        <Json value={initial} data-testid="deferred-meta" />
      </DemoCard>
    </>
  )
}
