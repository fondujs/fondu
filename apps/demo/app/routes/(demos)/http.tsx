import { type Errors, href, usePage } from 'fondu/client'
import { type FormEvent, useState } from 'react'
import { flushSync } from 'react-dom'

import { DemoCard, Json, SignInFirst, SubmitButton, TextField, Title } from '#/components/demo.tsx'
import { Button } from '#/components/ui/button.tsx'

type Contact = { id: number; name: string; email: string }

// No props: the page calls the JSON API (plain Hono handlers in routes/api/) with fetch.
export default function Http() {
  const signedIn = usePage().props.auth.user !== null
  const [contacts, setContacts] = useState<Contact[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [created, setCreated] = useState<{ contact: Contact } | null>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [creating, setCreating] = useState(false)
  const [status, setStatus] = useState<number | null>(null)
  const load = async () => {
    setLoading(true)
    const response = await fetch(href('/api/contacts'))
    setLoading(false)
    if (!response.ok) return setStatus(response.status)
    setStatus(null)
    setContacts(((await response.json()) as { contacts: Contact[] }).contacts)
  }
  const create = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    setCreating(true)
    const response = await fetch(href('/api/contacts'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    })
    setCreating(false)
    if (response.status === 422) {
      const { errors } = (await response.json()) as { errors: Errors }
      flushSync(() => setErrors(errors))
      form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }
    if (!response.ok) return setStatus(response.status)
    setErrors({})
    setCreated((await response.json()) as { contact: Contact })
    form.reset()
  }
  return (
    <>
      <Title>HTTP requests</Title>
      <h1>HTTP requests</h1>
      <p className="lede">
        Not every request is a page. The page calls JSON endpoints with <code>fetch</code>; invalid
        input is a <code>422 {'{ errors }'}</code>, as <code>withValidator</code> answers what
        isn&apos;t a page.
      </p>
      {signedIn ? null : (
        <div className="mb-4">
          <SignInFirst>to use the API, or watch it answer 401.</SignInFirst>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <DemoCard title="GET /api/contacts">
          <Button className="mb-3" onClick={load} disabled={loading} data-testid="load">
            {loading ? 'Loading…' : 'Load contacts'}
          </Button>
          {contacts ? (
            <ul data-testid="api-users">
              {contacts.map((u) => (
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
          <form className="grid gap-4" onSubmit={create} noValidate data-testid="create">
            <TextField label="Name" name="name" error={errors.name} testid="err-name" />
            <TextField label="Email" name="email" error={errors.email} testid="err-email" />
            <SubmitButton processing={creating}>Create</SubmitButton>
          </form>
          {created ? <Json value={created} className="mt-4" data-testid="created" /> : null}
        </DemoCard>
      </div>
    </>
  )
}
