import { back, defineHandler, flash, render } from 'fondu'
import { href, usePage } from 'fondu/client'
import * as z from 'zod/mini'

import { SubmitButton, Title } from '#/components/demo.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table.tsx'
import { auth } from '#/modules/auth/auth.server.ts'

export const loader = defineHandler(async (c) => {
  const { users } = await auth.api.listUsers({
    query: { limit: 100, sortBy: 'createdAt' },
    headers: c.req.raw.headers,
  })
  return render(c, Dashboard, {
    accounts: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role ?? 'user',
    })),
  })
})

export const actions = {
  // POST /admin/dashboard?role — Better Auth's admin plugin checks the caller is an admin too
  role: defineHandler.withValidator({
    body: z.object({ userId: z.string(), role: z.enum(['user', 'admin']) }),
  })(async (c, { body }) => {
    await auth.api.setRole({ body, headers: c.req.raw.headers })
    flash(c, { message: `Role changed to ${body.role}` })
    return back(c)
  }),
}

interface Props {
  accounts: Array<{ id: string; name: string; email: string; role: string }>
}

// A different layout (admin/_layout.tsx, the directory's), rendered in the browser only
export default function Dashboard({ accounts }: Props) {
  const me = usePage().props.auth.user
  return (
    <>
      <Title>Admin</Title>
      <p className="mb-2 text-sm">
        <a href={href('/')}>← Back to the demos</a>
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
                  <form action={href('/admin/dashboard?role')} method="post">
                    <input type="hidden" name="userId" value={a.id} />
                    <input
                      type="hidden"
                      name="role"
                      value={a.role === 'admin' ? 'user' : 'admin'}
                    />
                    <SubmitButton variant="outline" size="sm">
                      {a.role === 'admin' ? 'Make user' : 'Make admin'}
                    </SubmitButton>
                  </form>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  )
}
