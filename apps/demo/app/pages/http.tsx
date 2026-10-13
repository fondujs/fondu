import { Head, useHttp, usePage } from '@inertiajs/react'
import { href } from 'fondu/client'
import { useState } from 'react'

import { DemoCard, Json, SignInFirst, SubmitButton, TextField } from '#/components/demo.tsx'
import { Button } from '#/components/ui/button.tsx'

type Contact = { id: number; name: string; email: string }

// No props: the page calls the JSON API (plain Hono handlers in routes/api/) with Inertia's useHttp.
export default function Http() {
  const signedIn = usePage().props.auth.user !== null
  const list = useHttp<Record<string, never>, { contacts: Contact[] }>({})
  const create = useHttp<{ name: string; email: string }, { contact: Contact }>({ name: '', email: '' })
  const [status, setStatus] = useState<number | null>(null)
  const onHttpException = (r: { status: number }) => {
    setStatus(r.status)
    return false
  }
  return (
    <>
      <Head title="HTTP requests" />
      <h1>HTTP requests</h1>
      <p className="lede">
        Not every request is a page visit. <code>useHttp</code> calls JSON endpoints with the same form helpers:
        processing state, the response, and validation errors from a <code>422 {'{ errors }'}</code>.
      </p>
      {signedIn ? null : (
        <div className="mb-4">
          <SignInFirst>to use the API, or watch it answer 401.</SignInFirst>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <DemoCard title="GET /api/contacts">
          <Button
            className="mb-3"
            onClick={() => list.get(href('/api/contacts'), { onHttpException })}
            disabled={list.processing}
            data-testid="load"
          >
            {list.processing ? 'Loading…' : 'Load contacts'}
          </Button>
          {list.response ? (
            <ul data-testid="api-users">
              {list.response.contacts.map((u) => (
                <li key={u.id}>{u.name}</li>
              ))}
            </ul>
          ) : null}
          {status ? (
            <p className="text-destructive-foreground" data-testid="status">
              HTTP {status}
            </p>
          ) : null}
        </DemoCard>
        <DemoCard title="POST /api/contacts">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              create.post(href('/api/contacts'), { onHttpException })
            }}
            data-testid="create"
          >
            <TextField
              label="Name"
              value={create.data.name}
              onChange={(e) => create.setData('name', e.target.value)}
              error={create.errors.name}
              testid="err-name"
            />
            <TextField
              label="Email"
              value={create.data.email}
              onChange={(e) => create.setData('email', e.target.value)}
              error={create.errors.email}
              testid="err-email"
            />
            <SubmitButton processing={create.processing} errors={create.errors}>
              Create
            </SubmitButton>
          </form>
          {create.response ? <Json value={create.response} className="mt-4" data-testid="created" /> : null}
        </DemoCard>
      </div>
    </>
  )
}
