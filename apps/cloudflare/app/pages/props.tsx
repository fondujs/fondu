import { Head, usePage } from '@inertiajs/react'
import { Card, Json } from '../components/ui'

interface Props {
  text: string
  number: number
  float: number
  boolean: boolean
  nothing: null
  list: string[]
  profile: { id: number; name: string; email: string; roles: string[]; isAdmin: boolean }
  computedAt: string
}

export default function PropsDemo({ text, number, float, boolean, nothing, list, profile, computedAt }: Props) {
  const { auth } = usePage().props
  const rows: Array<[string, string]> = [['string', text], ['number', String(number)], ['float', String(float)], ['boolean', String(boolean)], ['nothing', String(nothing)], ['list', list.join(', ')]]
  return (
    <>
      <Head title="Props" />
      <h1>Props</h1>
      <p className="lede">
        Anything JSON can carry is a prop. The page component's parameters are the props' types, and <code>render()</code> checks the loader against them. A function prop is called only when it's included in the response.
      </p>
      <div className="grid-cards">
        <Card title="Scalars & lists">
          <dl className="grid grid-cols-[5rem_1fr] gap-y-1 text-[13px]" data-testid="scalars">
            {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd>{v}</dd></div>)}
          </dl>
        </Card>
        <Card title="An object">
          <Json value={profile} />
        </Card>
        <Card title="A function" tag="computed when sent">
          <p className="text-[13px]"><code>computedAt: () =&gt; new Date().toISOString()</code> ran at <span className="font-mono" data-testid="computed-at">{computedAt}</span>.</p>
        </Card>
        <Card title="Shared props" tag="share()">
          <p className="note mb-2">Set for every page by <code>routes/_middleware.ts</code>, typed by Inertia's <code>InertiaConfig</code>.</p>
          <Json value={{ auth }} />
        </Card>
      </div>
    </>
  )
}
