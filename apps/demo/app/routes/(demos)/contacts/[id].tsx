import { eq } from 'drizzle-orm'
import { back, defineHandler, flash, render, ValidationError } from 'fondu'
import { href, useForm, usePage } from 'fondu/client'
import { HTTPException } from 'hono/http-exception'
import * as z from 'zod/mini'

import { DemoCard, SignInFirst, SubmitButton, TextField, Title } from '#/components/demo.tsx'
import { db } from '#/db/index.server.ts'
import { contacts } from '#/db/schema/index.ts'
import { requireUser } from '#/modules/auth/auth.server.ts'
import { EMAIL_TAKEN, emailFree } from '#/modules/contacts/contacts.server.ts'
import { contactSchema } from '#/modules/contacts/schemas.ts'

const params = z.object({ id: z.coerce.number().check(z.int()) })

// GET /contacts/:id — `params.id` is a number; /contacts/abc is a 404
export const loader = defineHandler.withValidator({ params })(async (c, { params }) => {
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, params.id))
  if (!contact) throw new HTTPException(404)
  return render(c, Show, { contact })
})

// the changes are for signed-in users, like adding and deleting
export const actions = {
  // POST /contacts/:id?rename
  rename: defineHandler.withValidator({
    params,
    body: z.object({
      name: z.string().check(z.trim(), z.minLength(2, 'Name must be at least 2 characters')),
    }),
  })(requireUser, async (c, { params, body }) => {
    await db.update(contacts).set(body).where(eq(contacts.id, params.id))
    flash(c, { message: 'Renamed' })
    return back(c)
  }),
  // POST /contacts/:id?email
  email: defineHandler.withValidator({
    params,
    body: z.object({ email: contactSchema.shape.email }),
  })(requireUser, async (c, { params, body }) => {
    if (!(await emailFree(body.email, params.id))) throw new ValidationError({ email: EMAIL_TAKEN })
    await db.update(contacts).set(body).where(eq(contacts.id, params.id))
    flash(c, { message: 'Email changed' })
    return back(c)
  }),
}

export default function Show({
  contact,
}: {
  contact: { id: number; name: string; email: string }
}) {
  const { user } = usePage().props.auth
  // a form each: each shows the errors of its own fields, and is busy on its own
  const rename = useForm()
  const email = useForm()
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
              {...rename.form}
            >
              <TextField
                label="Name"
                {...rename.field('name')}
                defaultValue={contact.name}
                error={rename.errors.name}
                testid="err-rename"
              />
              <SubmitButton loading={rename.submitting}>Rename</SubmitButton>
            </form>
          </DemoCard>
          <DemoCard title="Email" tag="actions.email">
            <form
              action={href('/contacts/:id?email', { id: contact.id })}
              method="post"
              className="grid gap-4"
              data-testid="email"
              {...email.form}
            >
              <TextField
                label="Email"
                {...email.field('email')}
                defaultValue={contact.email}
                error={email.errors.email}
                testid="err-email"
              />
              <SubmitButton loading={email.submitting}>Change email</SubmitButton>
            </form>
          </DemoCard>
        </div>
      ) : (
        <SignInFirst>to change this contact.</SignInFirst>
      )}
    </>
  )
}
