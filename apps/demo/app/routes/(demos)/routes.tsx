import { href } from 'fondu/client'

import { DemoCard, Title } from '#/components/demo.tsx'
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
  ['routes/(demos)/index.tsx', '/', 'the page'],
  [
    'routes/(demos)/contacts/index.tsx',
    '/contacts',
    'loader, actions.create, actions.delete, the page',
  ],
  [
    'routes/(demos)/contacts/[id].tsx',
    '/contacts/:id',
    'loader, actions.rename, actions.email, the page',
  ],
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
      <Title>Routes & actions</Title>
      <h1>Routes & actions</h1>
      <p className="lede">
        Each file in <code>app/routes/</code> is a URL, handled by Hono. A page is a{' '}
        <code>.tsx</code> file: a <code>loader</code> (GET), an <code>action</code> (POST) or{' '}
        <code>actions</code> (POST <code>?name</code>, a form each), and the page as its default
        export; the browser gets the page alone. An API route is a <code>.ts</code> file exporting{' '}
        <code>GET</code>, <code>POST</code>, <code>PUT</code>, <code>PATCH</code>,{' '}
        <code>DELETE</code>. A <code>(group)</code> directory adds no URL segment.
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
            <a href={href('/contacts/:id', { id: 1 })} data-testid="contact-1">
              Open contact 1
            </a>
          </p>
        </DemoCard>
        <DemoCard title="Validated input" tag="withValidator">
          <Code>{`defineHandler.withValidator({ params, body })(\n  requireUser,\n  (c, { params, body }) => …)`}</Code>
          <p className="mt-3 text-muted-foreground">
            The guard runs first, then the schemas; <code>params.id</code> is a number.
          </p>
        </DemoCard>
        <DemoCard title="Links and forms are HTML's" tag="<a> · <form>">
          <Code>{`<a href={href('/contacts')}>\n<form action={href('/contacts?delete')}\n      method="post">`}</Code>
          <p className="mt-3 text-muted-foreground">
            Fondu's client swaps the page in place; without JavaScript, they work as they are.
          </p>
        </DemoCard>
      </div>
    </>
  )
}
