import { Form, Head, Link, useForm, usePage } from '@inertiajs/react'
import { href } from 'fondu/client'
import type { FormEvent } from 'react'

import { DemoCard, SignInFirst, SubmitButton, TextField } from '#/components/demo.tsx'

export default function Show({ contact }: { contact: { id: number; name: string; email: string } }) {
  // useForm: the form's state in React; errors of this form come back in its own error bag
  const rename = useForm({ name: contact.name })
  const { user } = usePage().props.auth
  const submit = (e: FormEvent) => {
    e.preventDefault()
    rename.post(href('/contacts/:id?rename', { id: contact.id }), {
      errorBag: 'rename',
      preserveScroll: true,
      showProgress: false,
    })
  }
  return (
    <>
      <Head title={contact.name} />
      <p className="mb-2 text-sm text-muted-foreground">
        <Link href={href('/contacts')}>← Contacts</Link>
      </p>
      <h1 data-testid="contact-name">{contact.name}</h1>
      <p className="lede">
        Two forms on one page, each with its own error bag: the server puts each form's errors under its name.
      </p>
      {/* the changes are for signed-in users (the actions use requireUser) */}
      {user ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <DemoCard title="Rename" tag="useForm · bag: rename">
            <form onSubmit={submit} className="grid gap-4" data-testid="rename">
              <TextField
                label="Name"
                value={rename.data.name}
                onChange={(e) => rename.setData('name', e.target.value)}
                error={rename.errors.name}
                testid="err-rename"
              />
              <SubmitButton processing={rename.processing} errors={rename.errors}>
                Rename
              </SubmitButton>
            </form>
          </DemoCard>
          <DemoCard title="Email" tag="<Form> · bag: email">
            <Form
              action={href('/contacts/:id?email', { id: contact.id })}
              method="post"
              errorBag="email"
              showProgress={false}
              options={{ preserveScroll: true }}
              className="grid gap-4"
              data-testid="email"
            >
              {({ errors }) => (
                <>
                  <TextField
                    label="Email"
                    name="email"
                    defaultValue={contact.email}
                    error={errors.email}
                    testid="err-email"
                  />
                  <SubmitButton>Change email</SubmitButton>
                </>
              )}
            </Form>
          </DemoCard>
        </div>
      ) : (
        <SignInFirst>to change this contact.</SignInFirst>
      )}
    </>
  )
}
