import { usePage } from 'fondu/client'

import { DemoCard, Json, Title } from '#/components/demo.tsx'

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

export default function PropsDemo({
  text,
  number,
  float,
  boolean,
  nothing,
  list,
  profile,
  computedAt,
}: Props) {
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
      <Title>Props</Title>
      <h1>Props</h1>
      <p className="lede">
        Anything JSON can carry is a prop. The page component's parameters are the props' types, and{' '}
        <code>render()</code> checks the loader against them: a <code>Date</code> for a{' '}
        <code>string</code> prop is fine (it arrives as one), a <code>Map</code> is a type error.
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
        <DemoCard title="A date" tag="as JSON delivers it">
          <p>
            <code>computedAt: new Date()</code> arrives as{' '}
            <span className="font-mono" data-testid="computed-at">
              {computedAt}
            </span>
            .
          </p>
        </DemoCard>
        <DemoCard title="Shared props" tag="share()">
          <p className="mb-3 text-muted-foreground">
            Set for every page by <code>routes/_middleware.ts</code>, typed by Fondu&apos;s{' '}
            <code>Register</code>.
          </p>
          <Json value={{ auth }} />
        </DemoCard>
      </div>
    </>
  )
}
