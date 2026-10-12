import { Head, Link, WhenMounted } from '@inertiajs/react'
import { href } from 'fondu/client'
import { Card } from '../components/ui'

const code = (lines: string[]) => <pre className="json">{lines.join('\n')}</pre>

export default function Ssr({ ssr }: { ssr: boolean }) {
  return (
    <>
      <Head title="Server-side rendering" />
      <h1>Server-side rendering</h1>
      <p className="lede">
        A page loaded as a document is rendered on the server (Inertia's own server render of <code>app/app.tsx</code>, in the same process), then hydrated. Visits after that render in the browser. Reload this page to see it: the badge at the top says how the document was rendered.
      </p>
      <div className="mb-4 flex gap-2">
        <a href={href('/ssr')} className="btn" data-testid="doc-ssr">Load with SSR</a>
        <a href={href('/ssr/browser')} className="btn" data-testid="doc-browser">Load without SSR</a>
        <Link href={href('/ssr/browser')} className="btn">Visit (no document load)</Link>
      </div>
      <div className="grid-cards">
        <Card title="This route" tag={ssr ? '/ssr' : '/ssr/browser'}>
          <p className="text-[13px]" data-testid="route-ssr">{ssr ? 'Server-rendered when loaded as a document.' : 'Never server-rendered: withoutSsr().'}</p>
        </Card>
        <Card title="Browser-only parts" tag="<WhenMounted>">
          <WhenMounted fallback={<p className="note">Rendered on the server: no window here.</p>}>
            {() => <p className="text-[13px]" data-testid="mounted">Window width: {window.innerWidth}px</p>}
          </WhenMounted>
        </Card>
        <Card title="Some routes without SSR" className="sm:col-span-2">
          <p className="note mb-2">Like Laravel's <code>withoutSsr</code>: a middleware, wherever middleware goes.</p>
          {code([
            '// routes/admin/_middleware.ts — /admin and everything below',
            'export default withoutSsr()',
            '',
            '// one route',
            'export const loader = defineHandler(withoutSsr(), (c) => render(c, …))',
          ])}
        </Card>
        <Card title="No SSR at all" className="sm:col-span-2">
          <p className="note mb-2">An app that never needs it (a dashboard): no server render is built.</p>
          {code(["fondu({ target: 'cloudflare', ssr: false })"])}
        </Card>
      </div>
    </>
  )
}
