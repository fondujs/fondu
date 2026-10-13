import { Form, Head, Link, useForm, usePage } from '@inertiajs/react'
import { href } from 'fondu/client'
import type { FormEvent } from 'react'
import * as z from 'zod/mini'

import { DemoCard, SubmitButton, TextField } from '#/components/demo.tsx'
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '#/components/ui/alert-dialog.tsx'
import { Button } from '#/components/ui/button.tsx'
import { contactSchema } from '#/schemas/contact.ts'

type Contact = { id: number; name: string; email: string }

export default function Contacts({ contacts }: { contacts: Contact[] }) {
  // the page's errors after the redirect back: what the form shows when it was submitted without JavaScript
  const pageErrors = usePage().props.errors
  // the same schema as the action, checked in the browser before anything is sent
  const quick = useForm({ name: '', email: '' })
  const addQuickly = (e: FormEvent) => {
    e.preventDefault()
    const result = contactSchema.safeParse(quick.data)
    if (!result.success) {
      const fields = z.flattenError(result.error).fieldErrors
      quick.clearErrors()
      quick.setError({ name: fields.name?.[0] ?? '', email: fields.email?.[0] ?? '' })
      return
    }
    quick.post(href('/contacts'), { preserveScroll: true, showProgress: false, onSuccess: () => quick.reset() })
  }
  return (
    <>
      <Head title="Forms & validation" />
      <h1>Forms & validation</h1>
      <p className="lede">
        One schema (<code>schemas/contact.ts</code>) validates on the server; invalid input is answered with a 303 back
        to this page and the errors in its <code>errors</code> prop. The same schema can check in the browser first, or
        the server can check each field as you leave it (Precognition), the address not yet taken included. Contacts are
        stored in D1.
      </p>
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <DemoCard title="Live validation" tag="<Form> · Precognition">
          {/* each field is checked by the action's own schema when you leave it; the action itself runs on submit */}
          <Form
            action={href('/contacts')}
            method="post"
            resetOnSuccess
            showProgress={false}
            className="grid gap-4"
            data-testid="add-contact"
          >
            {({ errors: formErrors, validate }) => {
              const errors = { ...pageErrors, ...formErrors }
              return (
                <>
                  <TextField
                    label="Name"
                    name="name"
                    onBlur={() => validate('name')}
                    error={errors.name}
                    testid="err-name"
                  />
                  <TextField
                    label="Email"
                    name="email"
                    onBlur={() => validate('email')}
                    error={errors.email}
                    testid="err-email"
                  />
                  <SubmitButton>Add contact</SubmitButton>
                </>
              )
            }}
          </Form>
        </DemoCard>
        <DemoCard title="Checked in the browser" tag="useForm · safeParse">
          <form onSubmit={addQuickly} className="grid gap-4" data-testid="quick-contact">
            <TextField
              label="Name"
              value={quick.data.name}
              onChange={(e) => quick.setData('name', e.target.value)}
              error={quick.errors.name}
              testid="quick-err-name"
            />
            <TextField
              label="Email"
              value={quick.data.email}
              onChange={(e) => quick.setData('email', e.target.value)}
              error={quick.errors.email}
              testid="quick-err-email"
            />
            <SubmitButton processing={quick.processing} errors={quick.errors}>
              Add contact
            </SubmitButton>
          </form>
        </DemoCard>
      </div>
      <DemoCard title="Contacts" tag="confirmed, optimistic delete">
        <ul className="divide-y" data-testid="contacts">
          {contacts.map((contact) => (
            <li key={contact.id} className="flex items-center gap-3 py-2">
              <Link href={href('/contacts/:id', { id: contact.id })} className="font-medium hover:underline">
                {contact.name}
              </Link>
              <span className="truncate text-muted-foreground">{contact.email}</span>
              {/* POST /contacts?delete once confirmed; the row disappears at once (optimistic), and comes back if
                  the request fails. Without JavaScript, the button deletes at once. */}
              <Form
                id={`delete-${contact.id}`}
                action={href('/contacts?delete')}
                method="post"
                showProgress={false}
                options={{ preserveScroll: true }}
                optimistic={(props) => ({ contacts: (props.contacts as Contact[]).filter((x) => x.id !== contact.id) })}
                className="ml-auto"
              >
                <input type="hidden" name="id" value={contact.id} />
                <AlertDialog>
                  <AlertDialogTrigger
                    type="submit"
                    onClick={(e) => e.preventDefault()}
                    render={<Button variant="ghost" size="sm" aria-label={`Delete ${contact.name}`} />}
                  >
                    Delete
                  </AlertDialogTrigger>
                  <AlertDialogPopup>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {contact.name}?</AlertDialogTitle>
                      <AlertDialogDescription>This removes {contact.email} from the contacts.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
                      <AlertDialogClose
                        type="submit"
                        form={`delete-${contact.id}`}
                        render={<Button variant="destructive" data-testid="confirm-delete" />}
                      >
                        Delete
                      </AlertDialogClose>
                    </AlertDialogFooter>
                  </AlertDialogPopup>
                </AlertDialog>
              </Form>
            </li>
          ))}
        </ul>
      </DemoCard>
    </>
  )
}
