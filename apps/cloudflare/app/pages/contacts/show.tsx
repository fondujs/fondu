import { Form, Head, Link, useForm } from '@inertiajs/react'
import { href } from 'fondu/client'
import type { FormEvent } from 'react'

import { Card, Field } from '#/components/ui.tsx'

export default function Show({ contact }: { contact: { id: number; name: string; email: string } }) {
  // useForm: the form's state in React; errors of this form come back in its own error bag
  const rename = useForm({ name: contact.name })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    rename.post(href('/contacts/:id?rename', { id: contact.id }), { errorBag: 'rename', preserveScroll: true })
  }
  return (
    <>
      <Head title={contact.name} />
      <p className="note mb-2">
        <Link href={href('/contacts')}>← Contacts</Link>
      </p>
      <h1 data-testid="contact-name">{contact.name}</h1>
      <p className="lede">
        Two forms on one page, each with its own error bag: the server puts each form's errors under its name.
      </p>
      <div className="grid-cards">
        <Card title="Rename" tag="useForm · bag: rename">
          <form onSubmit={submit} className="grid gap-3" data-testid="rename">
            <Field
              label="Name"
              value={rename.data.name}
              onChange={(e) => rename.setData('name', e.target.value)}
              error={rename.errors.name}
              testid="err-rename"
            />
            <button className="btn btn-primary justify-center" disabled={rename.processing}>
              Rename
            </button>
          </form>
        </Card>
        <Card title="Email" tag="<Form> · bag: email">
          <Form
            action={href('/contacts/:id?email', { id: contact.id })}
            method="post"
            errorBag="email"
            options={{ preserveScroll: true }}
            className="grid gap-3"
            data-testid="email"
          >
            {({ errors, processing }) => (
              <>
                <Field
                  label="Email"
                  name="email"
                  defaultValue={contact.email}
                  error={errors.email}
                  testid="err-email"
                />
                <button className="btn btn-primary justify-center" disabled={processing}>
                  Change email
                </button>
              </>
            )}
          </Form>
        </Card>
      </div>
    </>
  )
}
