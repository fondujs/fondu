import { Head, router } from '@inertiajs/react'

import { Card, Json } from '#/components/ui.tsx'

interface Props {
  page: number
  messages: Array<{ id: number; subject: string }>
  log: Array<{ id: string; at: string }>
  counters: { unread: Record<string, number> }
}

const reload = (only: string[], data: Record<string, string | number> = {}, reset: string[] = []) =>
  router.reload({ only, data, reset, preserveUrl: true })

export default function Merging({ page, messages, log, counters }: Props) {
  return (
    <>
      <Head title="Merging props" />
      <h1>Merging props</h1>
      <p className="lede">
        On a partial reload, merge props are combined with what the client already holds instead of replacing it:{' '}
        <code>merge()</code> appends, <code>prepend()</code> puts new items first, <code>deepMerge()</code> merges
        objects at any depth.
      </p>
      <div className="grid-cards">
        <Card title="Append" tag="merge(…, { matchOn: 'id' })">
          <ul className="rows mb-3 text-[13px]" data-testid="messages">
            {messages.map((m) => (
              <li key={m.id} className="py-1.5">
                {m.subject}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              className="btn btn-primary"
              onClick={() => reload(['messages', 'page'], { page: page + 1 })}
              data-testid="more"
            >
              Load page {page + 1}
            </button>
            <button
              className="btn"
              onClick={() => reload(['messages', 'page'], { page: 1 }, ['messages'])}
              data-testid="reset"
            >
              Reset
            </button>
          </div>
        </Card>
        <Card title="Prepend" tag="prepend()">
          <ul className="rows mb-3 font-mono text-[12px]" data-testid="log">
            {log.map((l) => (
              <li key={l.id} className="py-1.5">
                {l.at}
              </li>
            ))}
          </ul>
          <button className="btn btn-primary" onClick={() => reload(['log'])} data-testid="add-log">
            Add entry
          </button>
        </Card>
        <Card title="Deep merge" tag="deepMerge()" className="sm:col-span-2">
          <Json value={counters} data-testid="counters" />
          <div className="mt-3 flex gap-2">
            {['inbox', 'archive', 'spam'].map((area) => (
              <button
                key={area}
                className="btn"
                onClick={() => reload(['counters'], { area })}
                data-testid={`count-${area}`}
              >
                Count {area}
              </button>
            ))}
          </div>
        </Card>
      </div>
    </>
  )
}
