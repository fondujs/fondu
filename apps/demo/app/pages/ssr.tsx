import { href } from 'fondu/client'
import { useSyncExternalStore } from 'react'

import { DemoCard, Title } from '#/components/demo.tsx'
import { Button } from '#/components/ui/button.tsx'

const code = (lines: string[]) => (
  <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs/relaxed">
    {lines.join('\n')}
  </pre>
)

const noop = () => () => {}
/** the server's snapshot while it renders and hydrates (no window there), the browser's once mounted */
function Mounted() {
  const width = useSyncExternalStore(
    noop,
    () => window.innerWidth,
    () => null,
  )
  return width === null ? (
    <p className="text-muted-foreground">Rendered on the server: no window here.</p>
  ) : (
    <p data-testid="mounted">Window width: {width}px</p>
  )
}

export default function Ssr({ ssr }: { ssr: boolean }) {
  return (
    <>
      <Title>Server-side rendering</Title>
      <h1>Server-side rendering</h1>
      <p className="lede">
        A page loaded as a document is rendered on the server (<code>app/app.tsx</code>, in the same
        process), then hydrated. Navigations after that render in the browser. Reload this page to
        see it (on either route below): the badge at the top says how the document was rendered.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="outline" render={<a href={href('/ssr')} />}>
          With SSR
        </Button>
        <Button variant="outline" render={<a href={href('/ssr/browser')} />}>
          Without SSR
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <DemoCard title="This route" tag={ssr ? '/ssr' : '/ssr/browser'}>
          <p data-testid="route-ssr">
            {ssr
              ? 'Server-rendered when loaded as a document.'
              : 'Never server-rendered: withoutSsr().'}
          </p>
        </DemoCard>
        <DemoCard title="Browser-only parts" tag="useSyncExternalStore">
          <Mounted />
        </DemoCard>
        <DemoCard title="Some routes without SSR" className="sm:col-span-2">
          <p className="mb-3 text-muted-foreground">
            Like Laravel's <code>withoutSsr</code>: a middleware, wherever middleware goes.
          </p>
          {code([
            '// routes/admin/_middleware.ts — /admin and everything below',
            'export default withoutSsr()',
            '',
            '// one route',
            'export const loader = defineHandler(withoutSsr(), (c) => render(c, …))',
          ])}
        </DemoCard>
        <DemoCard title="No SSR at all" className="sm:col-span-2">
          <p className="mb-3 text-muted-foreground">
            An app that never needs it (a dashboard): no server render is built.
          </p>
          {code(["fondu({ target: 'cloudflare', ssr: false })"])}
        </DemoCard>
      </div>
    </>
  )
}
