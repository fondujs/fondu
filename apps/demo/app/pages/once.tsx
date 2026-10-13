import { Head, Link, usePage } from '@inertiajs/react'
import { href } from 'fondu/client'

import { DemoCard, Json } from '#/components/demo.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Card, CardPanel } from '#/components/ui/card.tsx'

interface Props {
  which: 'first' | 'second'
  renderedAt: string
  plans: string
  rates: string
}

export default function Once({ which, renderedAt, plans, rates }: Props) {
  const { onceProps } = usePage()
  const stat = (title: string, value: string, note: string, id: string) => (
    <Card>
      <CardPanel className="p-5">
        <p className="mb-2 font-medium">{title}</p>
        <p className="font-mono text-lg" data-testid={id}>
          {value}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{note}</p>
      </CardPanel>
    </Card>
  )
  return (
    <>
      <Head title="Once props" />
      <h1>Once props</h1>
      <p className="lede">
        Once props are resolved a single time and remembered by the client. On later visits the client lists them in{' '}
        <code>X-Inertia-Except-Once-Props</code> and the server skips their (slow) functions.
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">You're on the {which} page.</span>
        <Button variant="outline" render={<Link href={href('/once')} />} data-testid="first">
          First page
        </Button>
        <Button variant="outline" render={<Link href={`${href('/once')}?page=second`} />} data-testid="second">
          Second page
        </Button>
        <Button variant="outline" render={<Link href={`${href('/once')}?fresh`} />} data-testid="fresh">
          First page with <code>fresh</code>
        </Button>
      </div>
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        {stat('renderedAt (regular)', renderedAt, 'Changes on every visit.', 'rendered-at')}
        {stat('plans (once)', plans, 'Resolved once, reused when switching pages.', 'plans')}
        {stat('rates (once, 15s)', rates, 'ttl: 15 — fetched again after it expires.', 'rates')}
      </div>
      <DemoCard title="onceProps metadata">
        <Json value={onceProps} />
      </DemoCard>
    </>
  )
}
