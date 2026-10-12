import { Head, router, usePoll, WhenVisible } from '@inertiajs/react'
import { Card, Skeleton } from '../components/ui'

interface Props {
  time: string
  random: number
  requestCount: number
  report?: { rows: number; generatedAt: string }
}

export default function Partial({ time, random, requestCount, report }: Props) {
  const poll = usePoll(1000, { only: ['time'] }, { autoStart: false })
  const stat = (label: string, value: string | number, id: string) => (
    <div className="card"><p className="mb-2 text-[13px] font-medium">{label}</p><p className="font-mono text-xl tabular-nums" data-testid={id}>{value}</p></div>
  )
  return (
    <>
      <Head title="Partial reloads" />
      <h1>Partial reloads</h1>
      <p className="lede">
        The client sends <code>X-Inertia-Partial-Data</code> / <code>X-Inertia-Partial-Except</code> and the server only resolves the matching props. Always props are included regardless.
      </p>
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        {stat('time', time, 'time')}
        {stat('random', random, 'random')}
        {stat('requestCount (always)', requestCount, 'request-count')}
      </div>
      <div className="card mb-4">
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => router.reload({ only: ['time'] })} data-testid="only-time">Reload only time</button>
          <button className="btn btn-primary" onClick={() => router.reload({ only: ['random'] })} data-testid="only-random">Reload only random</button>
          <button className="btn" onClick={() => router.reload({ except: ['random'] })} data-testid="except-random">Reload except random</button>
          <button className="btn" onClick={() => (poll.polling ? poll.stop() : poll.start())} data-testid="poll">{poll.polling ? 'Stop polling' : 'Poll time every second'}</button>
        </div>
        <p className="note mt-3"><code>requestCount</code> increments on every reload: it's wrapped in <code>always()</code>, so it bypasses the partial filter.</p>
      </div>
      <Card title="Optional prop" className="mb-4">
        <p className="note mb-3"><code>report</code> is an <code>optional()</code> prop: never sent on the first load, only when a partial reload asks for it.</p>
        {report
          ? <p className="text-[13px]" data-testid="report">{report.rows} rows, generated at {report.generatedAt}</p>
          : <button className="btn btn-primary" onClick={() => router.reload({ only: ['report'] })} data-testid="load-report">Generate report</button>}
      </Card>
      <Card title="When visible" tag="<WhenVisible>">
        <p className="note mb-3">The same optional prop, requested when this card scrolls into view.</p>
        <WhenVisible data="report" fallback={<Skeleton />}>
          <p className="text-[13px]" data-testid="report-visible">Loaded: {report?.rows} rows</p>
        </WhenVisible>
      </Card>
    </>
  )
}
