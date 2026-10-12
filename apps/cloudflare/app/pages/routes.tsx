import { Head, Link } from '@inertiajs/react'
import { href } from 'fondu/client'
import { Card } from '../components/ui'

const files: Array<[file: string, url: string, exports: string]> = [
  ['routes/_middleware.ts', 'every request', 'default: the session, shared props'],
  ['routes/index.ts', '/', 'loader'],
  ['routes/contacts/index.ts', '/contacts', 'loader, action, actions.delete'],
  ['routes/contacts/[id].ts', '/contacts/:id', 'loader, actions.rename, actions.email'],
  ['routes/admin/_middleware.ts', '/admin/…', 'default: [requireAdmin, withoutSsr()]'],
  ['routes/api/contacts/index.ts', '/api/contacts', 'GET, POST'],
  ['routes/api/auth/[...all].ts', '/api/auth/*', 'GET, POST: Better Auth'],
]

export default function Routes() {
  return (
    <>
      <Head title="Routes & actions" />
      <h1>Routes & actions</h1>
      <p className="lede">
        Each file in <code>app/routes/</code> is a URL, handled by Hono. A page route exports a <code>loader</code> (GET), an <code>action</code> (POST) and <code>actions</code> (POST <code>?name</code>, so a plain form can pick one); an API route exports <code>GET</code>, <code>POST</code>, <code>PUT</code>, <code>PATCH</code>, <code>DELETE</code>. The page it renders lives in <code>app/pages/</code>.
      </p>
      <Card title="This app's routes" className="mb-4">
        <table className="w-full text-left text-[13px]" data-testid="routes">
          <thead className="text-muted"><tr><th className="py-1 font-normal">File</th><th className="font-normal">URL</th><th className="font-normal">Exports</th></tr></thead>
          <tbody className="divide-y divide-line">
            {files.map(([file, url, exports]) => <tr key={file}><td className="py-1.5 font-mono text-[12px]">{file}</td><td className="font-mono text-[12px]">{url}</td><td className="note">{exports}</td></tr>)}
          </tbody>
        </table>
      </Card>
      <div className="grid-cards">
        <Card title="Typed URLs" tag="href()">
          <p className="note mb-2">Only patterns that exist in <code>routes/</code>, with every param: a typo is a type error.</p>
          <pre className="json">{`href('/contacts/:id', { id: 1 })  // '${href('/contacts/:id', { id: 1 })}'\nhref('/contacts?delete')          // '${href('/contacts?delete')}'`}</pre>
          <p className="mt-3 text-[13px]"><Link href={href('/contacts/:id', { id: 1 })} data-testid="contact-1">Open contact 1</Link></p>
        </Card>
        <Card title="Validated input" tag="withValidator">
          <pre className="json">{`defineHandler.withValidator({ params, body })(\n  requireUser,\n  (c, { params, body }) => …)`}</pre>
          <p className="note mt-2">The guard runs first, then the schemas; <code>params.id</code> is a number.</p>
        </Card>
        <Card title="The method is Inertia's">
          <pre className="json">{`<Link href={href('/logout')}\n      method="post" as="button">\n<Form action={href('/contacts')}\n      method="post">`}</pre>
        </Card>
      </div>
    </>
  )
}
