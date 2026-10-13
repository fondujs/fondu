import { Head, usePage } from '@inertiajs/react'

import { DemoCard, Json } from '#/components/demo.tsx'

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
  const rows: Array<[string, string]> = [
    ['string', text],
    ['number', String(number)],
    ['float', String(float)],
    ['boolean', String(boolean)],
    ['nothing', String(nothing)],
    ['list', list.join(', ')],
  ]
  return (
    <>
      <Head title="Props" />
      <h1>Props</h1>
      <p className="lede">
        Anything JSON can carry is a prop. The page component's parameters are the props' types, and{' '}
        <code>render()</code> checks the loader against them. A function prop is called only when it's included in the
        response.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <DemoCard title="Scalars & lists">
          <dl className="grid grid-cols-[5rem_1fr] gap-y-1" data-testid="scalars">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </DemoCard>
        <DemoCard title="An object">
          <Json value={profile} />
        </DemoCard>
        <DemoCard title="A function" tag="computed when sent">
          <p>
            <code>computedAt: () =&gt; new Date().toISOString()</code> ran at{' '}
            <span className="font-mono" data-testid="computed-at">
              {computedAt}
            </span>
            .
          </p>
        </DemoCard>
        <DemoCard title="Shared props" tag="share()">
          <p className="mb-3 text-muted-foreground">
            Set for every page by <code>routes/_middleware.ts</code>, typed by Inertia's <code>InertiaConfig</code>.
          </p>
          <Json value={{ auth }} />
        </DemoCard>
      </div>
    </>
  )
}
