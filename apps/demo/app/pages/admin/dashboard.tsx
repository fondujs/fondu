import { Form, Head, Link, usePage } from '@inertiajs/react'
import { href } from 'fondu/client'

import { SubmitButton } from '#/components/demo.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table.tsx'

interface Props {
  accounts: Array<{ id: string; name: string; email: string; role: string }>
}

// A different layout (layouts/admin.tsx, chosen by the page name in app.tsx), rendered in the browser only
export default function Dashboard({ accounts }: Props) {
  const me = usePage().props.auth.user
  return (
    <>
      <Head title="Admin" />
      <p className="mb-2 text-sm">
        <Link href={href('/')}>← Back to the demos</Link>
      </p>
      <h1>Accounts</h1>
      <p className="lede">
        Only admins get here (<code>routes/admin/_middleware.ts</code>: <code>requireAdmin</code>,{' '}
        <code>withoutSsr()</code>). Roles are Better Auth's admin plugin.
      </p>
      <Table variant="card" data-testid="accounts">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="font-medium">{a.name}</TableCell>
              <TableCell className="text-muted-foreground">{a.email}</TableCell>
              <TableCell>
                <Badge variant={a.role === 'admin' ? 'info' : 'secondary'}>{a.role}</Badge>
              </TableCell>
              <TableCell className="text-right">
                {a.email === me?.email ? null : (
                  <Form
                    action={href('/admin/dashboard?role')}
                    method="post"
                    showProgress={false}
                    options={{ preserveScroll: true }}
                  >
                    <input type="hidden" name="userId" value={a.id} />
                    <input type="hidden" name="role" value={a.role === 'admin' ? 'user' : 'admin'} />
                    <SubmitButton variant="outline" size="sm">
                      {a.role === 'admin' ? 'Make user' : 'Make admin'}
                    </SubmitButton>
                  </Form>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  )
}
