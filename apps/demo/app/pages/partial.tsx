import { Head, router, usePoll, WhenVisible } from '@inertiajs/react'

import { DemoCard, Loading } from '#/components/demo.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Card, CardPanel } from '#/components/ui/card.tsx'

interface Props {
  time: string
  random: number
  requestCount: number
  report?: { rows: number; generatedAt: string }
}

export default function Partial({ time, random, requestCount, report }: Props) {
  const poll = usePoll(1000, { only: ['time'] }, { autoStart: false })
  const stat = (label: string, value: string | number, id: string) => (
    <Card>
      <CardPanel className="p-5">
        <p className="mb-2 font-medium">{label}</p>
        <p className="font-mono text-xl tabular-nums" data-testid={id}>
          {value}
        </p>
      </CardPanel>
    </Card>
  )
  return (
    <>
      <Head title="Partial reloads" />
      <h1>Partial reloads</h1>
      <p className="lede">
        The client sends <code>X-Inertia-Partial-Data</code> / <code>X-Inertia-Partial-Except</code>{' '}
        and the server only resolves the matching props. Always props are included regardless.
      </p>
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        {stat('time', time, 'time')}
        {stat('random', random, 'random')}
        {stat('requestCount (always)', requestCount, 'request-count')}
      </div>
      <Card className="mb-4">
        <CardPanel className="p-5">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => router.reload({ only: ['time'] })} data-testid="only-time">
              Reload only time
            </Button>
            <Button onClick={() => router.reload({ only: ['random'] })} data-testid="only-random">
              Reload only random
            </Button>
            <Button
              variant="outline"
              onClick={() => router.reload({ except: ['random'] })}
              data-testid="except-random"
            >
              Reload except random
            </Button>
            <Button
              variant="outline"
              onClick={() => (poll.polling ? poll.stop() : poll.start())}
              data-testid="poll"
            >
              {poll.polling ? 'Stop polling' : 'Poll time every second'}
            </Button>
          </div>
          <p className="mt-4 text-muted-foreground">
            <code>requestCount</code> increments on every reload: it's wrapped in{' '}
            <code>always()</code>, so it bypasses the partial filter.
          </p>
        </CardPanel>
      </Card>
      <DemoCard title="Optional prop" className="mb-4">
        <p className="mb-4 text-muted-foreground">
          <code>report</code> is an <code>optional()</code> prop: never sent on the first load, only
          when a partial reload asks for it.
        </p>
        {report ? (
          <p data-testid="report">
            {report.rows} rows, generated at {report.generatedAt}
          </p>
        ) : (
          <Button onClick={() => router.reload({ only: ['report'] })} data-testid="load-report">
            Generate report
          </Button>
        )}
      </DemoCard>
      {/* below the fold on any screen, so it loads only when scrolled to */}
      <DemoCard title="When visible" tag="<WhenVisible>" className="mt-[100dvh]">
        <p className="mb-4 text-muted-foreground">
          The same optional prop, requested when this card scrolls into view.
        </p>
        <WhenVisible data="report" fallback={<Loading />}>
          <p data-testid="report-visible">Loaded: {report?.rows} rows</p>
        </WhenVisible>
      </DemoCard>
    </>
  )
}
