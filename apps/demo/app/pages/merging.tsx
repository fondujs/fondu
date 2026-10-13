import { Head, router } from '@inertiajs/react'

import { DemoCard, Json } from '#/components/demo.tsx'
import { Button } from '#/components/ui/button.tsx'

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
      <div className="grid gap-4 sm:grid-cols-2">
        <DemoCard title="Append" tag="merge(…, { matchOn: 'id' })">
          <ul className="mb-4 divide-y" data-testid="messages">
            {messages.map((m) => (
              <li key={m.id} className="py-1.5">
                {m.subject}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button onClick={() => reload(['messages', 'page'], { page: page + 1 })} data-testid="more">
              Load page {page + 1}
            </Button>
            <Button
              variant="outline"
              onClick={() => reload(['messages', 'page'], { page: 1 }, ['messages'])}
              data-testid="reset"
            >
              Reset
            </Button>
          </div>
        </DemoCard>
        <DemoCard title="Prepend" tag="prepend()">
          <ul className="mb-4 divide-y font-mono text-xs" data-testid="log">
            {log.map((l) => (
              <li key={l.id} className="py-1.5">
                {l.at}
              </li>
            ))}
          </ul>
          <Button onClick={() => reload(['log'])} data-testid="add-log">
            Add entry
          </Button>
        </DemoCard>
        <DemoCard title="Deep merge" tag="deepMerge()" className="sm:col-span-2">
          <Json value={counters} data-testid="counters" />
          <div className="mt-4 flex flex-wrap gap-2">
            {['inbox', 'archive', 'spam'].map((area) => (
              <Button
                key={area}
                variant="outline"
                onClick={() => reload(['counters'], { area })}
                data-testid={`count-${area}`}
              >
                Count {area}
              </Button>
            ))}
          </div>
        </DemoCard>
      </div>
    </>
  )
}
