import { href, usePage, type Errors } from 'fondu/client'

import { DemoCard, SignInFirst, SubmitButton, TextField, Title } from '#/components/demo.tsx'

export default function Show({
  contact,
  errors,
}: {
  contact: { id: number; name: string; email: string }
  errors: Errors
}) {
  const { user } = usePage().props.auth
  return (
    <>
      <Title>{contact.name}</Title>
      <p className="mb-2 text-sm text-muted-foreground">
        <a href={href('/contacts')}>← Contacts</a>
      </p>
      <h1 data-testid="contact-name">{contact.name}</h1>
      <p className="lede">
        Two forms on one page, each posting to an action of its own (<code>?rename</code>,{' '}
        <code>?email</code>): each shows the errors of its own fields.
      </p>
      {/* the changes are for signed-in users (the actions use requireUser) */}
      {user ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <DemoCard title="Rename" tag="actions.rename">
            <form
              action={href('/contacts/:id?rename', { id: contact.id })}
              method="post"
              className="grid gap-4"
              data-testid="rename"
            >
              <TextField
                label="Name"
                name="name"
                defaultValue={contact.name}
                error={errors.name}
                testid="err-rename"
              />
              <SubmitButton>Rename</SubmitButton>
            </form>
          </DemoCard>
          <DemoCard title="Email" tag="actions.email">
            <form
              action={href('/contacts/:id?email', { id: contact.id })}
              method="post"
              className="grid gap-4"
              data-testid="email"
            >
              <TextField
                label="Email"
                name="email"
                defaultValue={contact.email}
                error={errors.email}
                testid="err-email"
              />
              <SubmitButton>Change email</SubmitButton>
            </form>
          </DemoCard>
        </div>
      ) : (
        <SignInFirst>to change this contact.</SignInFirst>
      )}
    </>
  )
}
