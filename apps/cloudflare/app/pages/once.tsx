import { Head, Link, usePage } from '@inertiajs/react'
import { href } from 'fondu/client'
import { Card, Json } from '../components/ui'

interface Props {
  which: 'first' | 'second'
  renderedAt: string
  plans: string
  rates: string
}

export default function Once({ which, renderedAt, plans, rates }: Props) {
  const { onceProps } = usePage()
  const stat = (title: string, value: string, note: string, id: string) => (
    <div className="card"><p className="mb-2 text-[13px] font-medium">{title}</p><p className="font-mono text-lg" data-testid={id}>{value}</p><p className="note mt-1 text-[12px]">{note}</p></div>
  )
  return (
    <>
      <Head title="Once props" />
      <h1>Once props</h1>
      <p className="lede">
        Once props are resolved a single time and remembered by the client. On later visits the client lists them in <code>X-Inertia-Except-Once-Props</code> and the server skips their (slow) functions.
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[13px]">
        <span className="note">You're on the {which} page.</span>
        <Link href={href('/once')} className="btn" data-testid="first">First page</Link>
        <Link href={`${href('/once')}?page=second`} className="btn" data-testid="second">Second page</Link>
        <Link href={`${href('/once')}?fresh`} className="btn" data-testid="fresh">First page with <code>fresh</code></Link>
      </div>
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        {stat('renderedAt (regular)', renderedAt, 'Changes on every visit.', 'rendered-at')}
        {stat('plans (once)', plans, 'Resolved once, reused when switching pages.', 'plans')}
        {stat('rates (once, 15s)', rates, 'ttl: 15 — fetched again after it expires.', 'rates')}
      </div>
      <Card title="onceProps metadata"><Json value={onceProps} /></Card>
    </>
  )
}
