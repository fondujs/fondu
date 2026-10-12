import { Form, Head, usePage } from '@inertiajs/react'
import { href } from 'fondu/client'

interface Props {
  accounts: Array<{ id: string; name: string; email: string; role: string }>
}

// A different layout (layouts/admin.tsx, chosen by the page name in app.tsx), rendered in the browser only
export default function Dashboard({ accounts }: Props) {
  const me = usePage().props.auth.user
  return (
    <>
      <Head title="Admin" />
      <h1>Accounts</h1>
      <p className="lede">
        Only admins get here (<code>routes/admin/_middleware.ts</code>: <code>requireAdmin</code>,{' '}
        <code>withoutSsr()</code>). Roles are Better Auth's admin plugin.
      </p>
      <table className="w-full text-left text-[13px]" data-testid="accounts">
        <thead className="text-muted">
          <tr>
            <th className="py-2 font-normal">Name</th>
            <th className="font-normal">Email</th>
            <th className="font-normal">Role</th>
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {accounts.map((a) => (
            <tr key={a.id}>
              <td className="py-2 font-medium">{a.name}</td>
              <td className="text-muted">{a.email}</td>
              <td>{a.role}</td>
              <td className="text-right">
                {a.name === me?.name ? null : (
                  <Form action={href('/admin/dashboard?role')} method="post" options={{ preserveScroll: true }}>
                    <input type="hidden" name="userId" value={a.id} />
                    <input type="hidden" name="role" value={a.role === 'admin' ? 'user' : 'admin'} />
                    <button className="btn">{a.role === 'admin' ? 'Make user' : 'Make admin'}</button>
                  </Form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
