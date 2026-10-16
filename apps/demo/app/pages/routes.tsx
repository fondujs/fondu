import { Head, Link } from '@inertiajs/react'
import { href } from 'fondu/client'

import { DemoCard } from '#/components/demo.tsx'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table.tsx'

const files: Array<[file: string, url: string, exports: string]> = [
  ['routes/_middleware.ts', 'every request', 'default: the session, shared props'],
  ['routes/index.ts', '/', 'loader'],
  ['routes/contacts/index.ts', '/contacts', 'loader, action, actions.delete'],
  ['routes/contacts/[id].ts', '/contacts/:id', 'loader, actions.rename, actions.email'],
  ['routes/admin/_middleware.ts', '/admin/…', 'default: [requireAdmin, withoutSsr()]'],
  ['routes/api/contacts/index.ts', '/api/contacts', 'GET, POST'],
  ['routes/api/auth/[...all].ts', '/api/auth/*', 'GET, POST: Better Auth'],
]

const Code = ({ children }: { children: string }) => (
  <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs/relaxed">
    {children}
  </pre>
)

export default function Routes() {
  return (
    <>
      <Head title="Routes & actions" />
      <h1>Routes & actions</h1>
      <p className="lede">
        Each file in <code>app/routes/</code> is a URL, handled by Hono. A page route exports a{' '}
        <code>loader</code> (GET), an <code>action</code> (POST) and <code>actions</code> (POST{' '}
        <code>?name</code>, so a plain form can pick one); an API route exports <code>GET</code>,{' '}
        <code>POST</code>, <code>PUT</code>, <code>PATCH</code>, <code>DELETE</code>. The page it
        renders lives in <code>app/pages/</code>.
      </p>
      <DemoCard title="This app's routes" className="mb-4">
        <Table data-testid="routes">
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>URL</TableHead>
              <TableHead>Exports</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.map(([file, url, exports]) => (
              <TableRow key={file}>
                <TableCell className="font-mono text-xs">{file}</TableCell>
                <TableCell className="font-mono text-xs">{url}</TableCell>
                <TableCell className="text-muted-foreground">{exports}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DemoCard>
      <div className="grid gap-4 sm:grid-cols-2">
        <DemoCard title="Typed URLs" tag="href()">
          <p className="mb-3 text-muted-foreground">
            Only patterns that exist in <code>routes/</code>, with every param: a typo is a type
            error.
          </p>
          <Code>{`href('/contacts/:id', { id: 1 })  // '${href('/contacts/:id', { id: 1 })}'\nhref('/contacts?delete')          // '${href('/contacts?delete')}'`}</Code>
          <p className="mt-3">
            <Link href={href('/contacts/:id', { id: 1 })} data-testid="contact-1">
              Open contact 1
            </Link>
          </p>
        </DemoCard>
        <DemoCard title="Validated input" tag="withValidator">
          <Code>{`defineHandler.withValidator({ params, body })(\n  requireUser,\n  (c, { params, body }) => …)`}</Code>
          <p className="mt-3 text-muted-foreground">
            The guard runs first, then the schemas; <code>params.id</code> is a number.
          </p>
        </DemoCard>
        <DemoCard title="The method is Inertia's">
          <Code>{`<Link href={href('/logout')}\n      method="post" as="button">\n<Form action={href('/contacts')}\n      method="post">`}</Code>
        </DemoCard>
      </div>
    </>
  )
}
