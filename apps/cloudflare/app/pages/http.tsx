import { useState } from 'react'
import { Head, Link, useHttp, usePage } from '@inertiajs/react'
import { href } from 'fondu/client'
import { Card, Json } from '../components/ui'

type Contact = { id: number; name: string; email: string }

// No props: the page calls the JSON API (plain Hono handlers in routes/api/) with Inertia's useHttp.
export default function Http() {
  const signedIn = usePage().props.auth.user !== null
  const list = useHttp<Record<string, never>, { contacts: Contact[] }>({})
  const create = useHttp<{ name: string; email: string }, { contact: Contact }>({ name: '', email: '' })
  const [status, setStatus] = useState<number | null>(null)
  const onHttpException = (r: { status: number }) => { setStatus(r.status); return false }
  return (
    <>
      <Head title="HTTP requests" />
      <h1>HTTP requests</h1>
      <p className="lede">
        Not every request is a page visit. <code>useHttp</code> calls JSON endpoints with the same form helpers: processing state, the response, and validation errors from a <code>422 {'{ errors }'}</code>.
        {signedIn ? null : <> The API is for signed-in users: <Link href={href('/login')}>sign in</Link> or watch the 401.</>}
      </p>
      <div className="grid-cards">
        <Card title="GET /api/contacts">
          <button className="btn btn-primary mb-3" onClick={() => list.get(href('/api/contacts'), { onHttpException })} disabled={list.processing} data-testid="load">
            {list.processing ? 'Loading…' : 'Load contacts'}
          </button>
          {list.response ? <ul className="text-[13px]" data-testid="api-users">{list.response.contacts.map((u) => <li key={u.id}>{u.name}</li>)}</ul> : null}
          {status ? <p className="err" data-testid="status">HTTP {status}</p> : null}
        </Card>
        <Card title="POST /api/contacts">
          <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); create.post(href('/api/contacts'), { onHttpException }) }} data-testid="create">
            <input className="input" placeholder="Name" value={create.data.name} onChange={(e) => create.setData('name', e.target.value)} />
            {create.errors.name && <span className="err" data-testid="err-name">{create.errors.name}</span>}
            <input className="input" placeholder="Email" value={create.data.email} onChange={(e) => create.setData('email', e.target.value)} />
            {create.errors.email && <span className="err" data-testid="err-email">{create.errors.email}</span>}
            <button className="btn btn-primary justify-center" disabled={create.processing}>Create</button>
          </form>
          {create.response ? <Json value={create.response} className="json mt-3" data-testid="created" /> : null}
        </Card>
      </div>
    </>
  )
}
